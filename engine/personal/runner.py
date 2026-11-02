"""P4.4 阶段二 — PersonalRunner：把一份合同放到 Octop 上真实执行并验证。

数据流（计划 §2.1，单向）：
    TaskEnvelope(+rules) -> BaselinePolicy/RuleEngine 规划
      -> Octop WS user_turn（读类工具放行，写类工具 HITL 暂停）
      -> on_hitl: PermissionGate.authorize（规则→范围→风险→token 绑定）
         approve / reject(用户可读中文原因)
      -> receipts(live 流完整 args+result) -> 逐条 verifier（本地磁盘事实）
      -> RunnerReport（events/receipts/verification；绝不把"模型说完成"当证据）

红线：
- 高风险动作没有有效 token 一律 reject（PermissionDenied 的 user_message 直达用户）；
- 验证状态只有 verified/failed/executed_unverified/unverifiable，没有 done；
- runner 不写 SQLite（持久化是 TS 后端的职责）。
"""

from __future__ import annotations

import ast
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .adapters.octop_http import OctopHttpClient
from .decision_types import CandidateAction
from .permission_gate import PermissionDenied, PermissionGate
from .protocols.octop import ToolReceipt
from .rules import EngineRule, RuleEngine
from .search_policy import evaluate_search
from .search_receipts import search_evidence_of, search_receipt_from_receipt
from .tools.verifiers import VerifierResult, verify_create_draft, verify_read_file

# Octop 工具名 -> org-engine 动作 kind / 风险
# 搜索类单独成 web_search（不是 external_send）：外发的是查询，风险中，
# 且必须同时过 network_policy；未知工具仍落高风险分支。
_TOOL_MAP: dict[str, tuple[str, str]] = {
    "ls": ("read", "low"),
    "read_file": ("read", "low"),
    "glob": ("read", "low"),
    "grep": ("read", "low"),
    "write_file": ("draft", "medium"),
    "edit_file": ("draft", "medium"),
    "searchfree_search": ("web_search", "medium"),
    "tavily_search": ("web_search", "medium"),
    "brave_search": ("web_search", "medium"),
    "google_search": ("web_search", "medium"),
    "kimi_search": ("web_search", "medium"),
    "web_fetch": ("web_fetch", "medium"),
    "execute": ("external_send", "high"),
    "browser_use": ("external_send", "high"),
    "send_file_to_user": ("external_send", "high"),
    "read_env_file": ("read", "medium"),
    "write_env_file": ("external_send", "high"),
}
READ_TOOLS = ("ls", "read_file", "glob", "grep")
SEARCH_TOOL_NAMES = ("searchfree_search", "tavily_search", "brave_search",
                     "google_search", "kimi_search", "web_fetch")


def rule_from_dict(d: dict[str, Any]) -> EngineRule:
    """user-rule schema dict（TS store 形状）→ EngineRule。字段名对齐 schema。"""
    when = d.get("when") or {}
    then = d.get("then") or {}
    return EngineRule(
        id=str(d.get("id", "")),
        when_event=str(when.get("event", "any_action")),
        then_action=str(then.get("action", "allow")),
        priority=int(d.get("priority", 0) or 0),
        scope=when.get("scope") if when.get("scope") not in (None, "all") else None,
        source=str(d.get("source", "user_explicit")),
        status=d.get("status", "active"),  # type: ignore[arg-type]
        version=int(d.get("version", 1) or 1),
    )


def _candidate_for(call_id: str, tool: str, args: dict[str, Any]) -> CandidateAction:
    kind, risk = _TOOL_MAP.get(tool, (tool, "high"))
    return CandidateAction(
        id=f"oct_{call_id}", kind=kind, risk_level=risk,  # type: ignore[arg-type]
        parameters=args if isinstance(args, dict) else {"raw": args},
    )


@dataclass
class RunnerReport:
    status: str  # done | error
    error: str | None
    final_text: str
    events: list[dict[str, Any]] = field(default_factory=list)
    receipts: list[dict[str, Any]] = field(default_factory=list)
    verifications: list[dict[str, Any]] = field(default_factory=list)
    hitl_log: list[dict[str, Any]] = field(default_factory=list)
    search_decisions: list[dict[str, Any]] = field(default_factory=list)
    search_receipts: list[dict[str, Any]] = field(default_factory=list)

    @property
    def overall_verification(self) -> str:
        """verified 仅当 turn 正常结束且全部已执行回执验证通过。

        红线（防御性，不依赖 TS 侧）：turn 未以 done 结束（timeout/error）时，
        即使已有回执全部验证通过也一律 unverifiable——一个超时的 turn 可能
        只写了半份文件，把"部分成功"当成 verified 就是假成功。

        额外红线：本轮发生过搜索调用，但没有一条带来源 URL 的 SearchReceipt
        → 不能声称 verified（外部事实无引用 = 不可核）。
        """
        if self.status != "done":
            return "unverifiable"
        if not self.verifications:
            return "unverifiable"
        statuses = {v["status"] for v in self.verifications}
        if statuses == {"verified"}:
            searched = self.search_decisions or self.search_receipts
            if searched and not any(r.get("results") for r in self.search_receipts):
                return "executed_unverified"
            return "verified"
        if "failed" in statuses:
            return "failed"
        return "executed_unverified"


class PersonalRunner:
    def __init__(
        self,
        client: OctopHttpClient,
        agent_id: str,
        workspace_root: Path,
        allowed_scopes: tuple[str, ...] = (),
    ) -> None:
        self.client = client
        self.agent_id = agent_id
        self.workspace_root = Path(workspace_root)
        self.allowed_scopes = allowed_scopes

    # -- hitl gate -------------------------------------------------------------

    def _make_gate(self, rules: list[EngineRule], token: str | None) -> PermissionGate:
        # 当前 token 只在本进程内有效；跨语言握手未实现（见 handoff 文档）。
        # ConfirmationGate（TS）与 PermissionGate（Python）各持进程内 Map，
        # 因此这里刻意忽略传入的 token。本 Task 只保证两侧 hash 算法一致；
        # "TS 签发的 token 能被 Python 校验"尚未打通。
        def norm(s: str) -> str:
            s = s.replace("workspace/", "").strip("/")
            return s + "/" if s else ""  # 空 = 工作区全域
        scopes = tuple(norm(s) for s in self.allowed_scopes)
        return PermissionGate(RuleEngine(rules), allowed_scopes=scopes)

    @staticmethod
    def _normalize_args(args: Any) -> dict[str, Any]:
        """Octop agent 路径以工作区为根（/inbox/...）；org-engine scope 是
        工作区相对前缀（inbox/）。进 gate 前剥掉前导 '/'，并把 Octop 的
        file_path 键映射到 permission_gate 认的 path 键（否则范围检查误拒）。"""
        if not isinstance(args, dict):
            return {"raw": args} if args is not None else {}
        out = dict(args)
        for key in ("path", "file_path", "target"):
            if isinstance(out.get(key), str):
                out[key] = out[key].lstrip("/")
        if "path" not in out and isinstance(out.get("file_path"), str):
            out["path"] = out["file_path"]
        if "target" not in out and isinstance(out.get("path"), str):
            out["target"] = out["path"]
        return out

    def _on_hitl(self, gate: PermissionGate, task_id: str, token: str | None,
                 network_policy: dict[str, Any] | None = None,
                 search_log: list[dict[str, Any]] | None = None):
        def handler(request: dict[str, Any]) -> list[dict[str, Any]]:
            decisions: list[dict[str, Any]] = []
            for req in request.get("action_requests", []):
                tool = str(req.get("name", ""))
                args = self._normalize_args(req.get("args"))
                # 搜索：先把 query 过 network_policy（隐私/域名/provider），
                # 再进常规门禁。搜索不是 external_send，但外发内容必须受控。
                if tool in SEARCH_TOOL_NAMES:
                    query = str(args.get("query") or args.get("q") or "")
                    verdict = evaluate_search(network_policy, tool, query)
                    if search_log is not None:
                        # 只落 hash + 脱敏 query；原文绝不进 trace。
                        search_log.append({
                            "tool": tool, "provider": verdict.provider,
                            "verdict": verdict.verdict, "reason": verdict.reason,
                            "query_hash": verdict.query_hash,
                            "query_redacted": verdict.query_redacted,
                        })
                    if verdict.verdict != "allow":
                        decisions.append({"type": "reject", "message": verdict.reason})
                        continue
                action = _candidate_for(str(req.get("call_id") or f"{tool}:{len(decisions)}"), tool, args)
                # 整段门禁（含 token 签发）必须捕获 TypeError：参数里出现非整数
                # 浮点等无法 canonical 化的值时，这是"这个动作不能确认"，
                # 应拒绝该动作并继续处理后续动作，而不是让整个 turn 500。
                try:
                    # token 绑定按调用逐个签发：同一次 user_turn 内 params 在 plan 时未知，
                    # 故对写类工具先签发再验证——token 只绑定本 turn 本调用本次参数。
                    turn_token = token
                    if turn_token is None and action.kind == "draft":
                        turn_token = gate.issue_confirmation(task_id, action).token
                    gate.authorize(task_id, action, turn_token)
                    decisions.append({"type": "approve"})
                except PermissionDenied as denied:
                    decisions.append({"type": "reject", "message": denied.user_message})
                except TypeError:
                    decisions.append({
                        "type": "reject",
                        "message": "这个操作的参数包含无法确认的数值，已拒绝。",
                    })
            if not decisions:
                decisions = [{"type": "reject", "message": "没有可审批的动作。"}]
            return decisions

        return handler

    # -- verify ----------------------------------------------------------------

    def _verify_receipt(self, receipt: ToolReceipt) -> VerifierResult | None:
        if receipt.is_error or receipt.result is None:
            return None
        tool = receipt.tool_name
        args = receipt.args if isinstance(receipt.args, dict) else {}
        if "_unparsed_args" in args:
            rel = ""  # 流片段残缺 → 定位不到 → unverifiable（绝不假 verified）
        else:
            rel = str(args.get("path") or args.get("file_path") or "").lstrip("/")
        if tool == "read_file":
            return verify_read_file(str(self.workspace_root / rel), content_hash_at_read=None)
        if tool in ("write_file", "edit_file"):
            return verify_create_draft(str(self.workspace_root / rel))
        if tool in ("ls", "glob", "grep"):
            return self._verify_listing(tool, receipt, rel)
        return None  # 其他工具暂无本地验证器 → 不声称验证

    def _verify_listing(self, tool: str, receipt: ToolReceipt,
                        rel: str) -> VerifierResult | None:
        """ls / glob / grep 的本地验证：目录存在，且结果里的条目真的在磁盘上。

        为什么需要这个：只读的目录列举是 Occamy 这类高效模型完成任务的主要手段
        （它常常只调一次 ls 就够了，不会再去 read_file）。若不给它们验证器，
        `verifications` 为空 → overall 落 `unverifiable`，一个完全正确的任务
        会被标成"无法确认"。这与"绝不假 verified"不冲突：我们仍然只核对
        磁盘事实，不采信模型的话。
        """
        target = self.workspace_root / rel if rel else self.workspace_root
        checks: list[dict[str, Any]] = []
        exists = target.is_dir()
        checks.append({"check": "directory_exists", "passed": exists, "path": str(target)})
        if not exists:
            return VerifierResult(
                status="unverifiable", checks=checks,
                reason="列出的目录已不存在，无法确认列举结果。",
            )
        # 从工具返回里抽出看起来像文件名的条目，逐个核对磁盘。
        #
        # 实测（Occamy + Octop）ls 的 result 形如 Python repr 的列表：
        #   "['/ten_document_inbox/doc_01.md', '/ten_document_inbox/doc_02.md', ...]"
        # 条目还带工作区前缀。所以要先按 JSON/Python 列表尝试解析，再逐条
        # 归一化成"相对本目录的文件名"，然后才核对磁盘。
        raw = receipt.result
        names: list[str] = []

        def _tidy(s: str) -> str:
            t = s.strip().strip("\"'`").rstrip("/")
            # 去掉列出的目录前缀本身（绝对形式 /inbox/x.md 或 inbox/x.md）
            prefix = rel.strip("/")
            if prefix and t.startswith("/" + prefix + "/"):
                t = t[len(prefix) + 2:]
            elif prefix and t.startswith(prefix + "/"):
                t = t[len(prefix) + 1:]
            return t.lstrip("/")

        candidates: list[str] = []
        if isinstance(raw, str):
            text = raw.strip()
            parsed = None
            if text.startswith("[") and text.endswith("]"):
                for loader in (json.loads, ast.literal_eval):
                    try:
                        parsed = loader(text)
                        break
                    except Exception:  # noqa: BLE001 — 不是 JSON 就退回按行解析
                        parsed = None
            if isinstance(parsed, list):
                candidates = [x for x in parsed if isinstance(x, str)]
            else:
                for line in raw.splitlines():
                    token = line.strip().strip("-*`'\" ").split()[0] if line.strip() else ""
                    token = token.strip("\"'`,").rstrip("/")
                    if token and ("/" in token or "." in token) and not token.startswith("{"):
                        candidates.append(token)
        elif isinstance(raw, list):
            for item in raw:
                if isinstance(item, str):
                    candidates.append(item)
                elif isinstance(item, dict) and isinstance(item.get("path"), str):
                    candidates.append(item["path"])

        names = [n for n in (_tidy(c) for c in candidates) if n]
        if not names:
            return VerifierResult(
                status="executed_unverified", checks=checks,
                reason="工具返回里没有可核对的条目名。",
            )
        missing = []
        for name in names[:200]:
            candidate = self.workspace_root / rel / name if rel else self.workspace_root / name
            if not candidate.exists():
                missing.append(name)
        checks.append({
            "check": "listed_entries_exist",
            "passed": not missing,
            "checked": min(len(names), 200),
            "missing": missing[:10],
        })
        if missing:
            return VerifierResult(
                status="failed", checks=checks,
                reason=f"列举结果里有 {len(missing)} 个条目在磁盘上不存在。",
            )
        return VerifierResult(
            status="verified", checks=checks,
            reason=f"目录存在，列举的 {min(len(names), 200)} 个条目都在磁盘上。",
        )

    # -- main entry ------------------------------------------------------------

    def run(
        self,
        task_id: str,
        goal: str,
        rules: list[EngineRule],
        confirmation_token: str | None,
        *,
        thread_id: str | None = None,
        timeout_s: float | None = None,
        network_policy: dict[str, Any] | None = None,
    ) -> RunnerReport:
        report = RunnerReport(status="error", error=None, final_text="")
        gate = self._make_gate(rules, confirmation_token)
        # 只有读类工具进 per-turn 放行名单。搜索工具刻意不放行：它们必须
        # 触发 HITL，_on_hitl 才能在 query 真正外发前过 network_policy。
        # （前提：Octop 全局 HITL 的工具清单包含搜索工具——见 search_policy
        #  的 required_hitl_tools()，部署时必须核对。）
        hitl_policy = {"mode": "allow_tools", "tools": list(READ_TOOLS)}
        result = self.client.run_turn(
            self.agent_id, thread_id or self.client.create_thread(self.agent_id), goal,
            on_hitl=self._on_hitl(gate, task_id, confirmation_token, network_policy,
                                  report.search_decisions),
            hitl_policy=hitl_policy,
            timeout_s=timeout_s or 900.0,
        )
        report.status = result["status"]
        report.error = result.get("error")
        report.final_text = result.get("final_text", "")
        report.hitl_log = result.get("hitl_log", [])
        for r in result.get("receipts", []):
            report.receipts.append(r)
            report.events.append({
                "event_type": "action_completed" if not r.get("is_error") else "action_failed",
                "payload": {"action_id": r["event_id"], "tool": r["tool_name"]},
            })
            # 回执 → evidence dict（协议层映射，content_hash 由协议 canonical 规则）
            ev = r.get("evidence") or {}
            report.events[-1]["evidence"] = ev
            tool = r["tool_name"]
            receipt_obj = ToolReceipt(
                protocol_version="1.0.0", event_id=r["event_id"], thread_id="",
                agent_id="", seq=0, ts=0.0, turn_id=None, request_seq=None,
                is_error=bool(r.get("is_error")), summary="", call_id=r.get("call_id"),
                tool_name=tool, args=r.get("args"), result=r.get("result"), raw_payload={},
            )
            v = self._verify_receipt(receipt_obj)
            if v is not None:
                report.verifications.append({
                    "event_id": r["event_id"], "tool": tool,
                    "status": v.status, "checks": v.checks, "reason": v.reason,
                })
            # 搜索回执 → 可引用证据（含来源 URL），原文不落库。
            sr = search_receipt_from_receipt(
                event_id=r["event_id"], tool_name=tool,
                args=r.get("args"), result=r.get("result"),
                policy=network_policy,
            )
            if sr is not None:
                report.search_receipts.append({
                    **sr.to_dict(), "evidence": search_evidence_of(sr),
                })
        return report
