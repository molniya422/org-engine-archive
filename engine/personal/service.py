"""P4.4 阶段二 — personal decision service：把 engine/personal 的决策与验证能力
以薄 HTTP 壳暴露给 TS backend（管线编排与持久化都在 TS 侧）。

stdlib http.server，零新依赖；只绑 loopback。端点：

  GET  /health
  POST /v1/plan     {task: TaskEnvelope dict, rules: [user-rule dict]}
                    → {plan: PlanEnvelope dict}          （BaselinePolicy + 合同约束）
  POST /v1/execute  {plan, rules, confirmation_token?, octop: {base_url, username,
                    password, workspace_root, agent_name?, agent_id?, allow_remote?},
                    thread_id?, timeout_s?}
                    → {report}                           （PersonalRunner 驱动真实执行）
  POST /v1/verify   {receipts, workspace_root}
                    → {verification}                     （按本地磁盘事实复核）
  POST /v1/eval     {cases, outcomes}
                    → {report}                           （回归集评估；空集不 ready）
  POST /v1/replay   {record, from_step?}
                    → {events}                           （从决策节点重放）
  POST /v1/replay/compare {old, new}
                    → {diff}                             （动作/询问/证据差异）
  POST /v1/simulate {contract, calls}
                    → {simulation}                       （沙盒模拟，永不产生真实验证）

红线：Python 永不写 SQLite；执行结果永远带逐回执验证，没有裸 done。
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .adapters.octop_http import OctopHttpClient, OctopPreflightError
from .decision_types import CandidateAction, DecisionConstraints, DecisionState
from .envelopes import PlanEnvelope, TaskEnvelope
from .policies.baseline import BaselinePolicy
from .runner import PersonalRunner, rule_from_dict

DEFAULT_PORT = 5174  # 5172=editor backend, 5173=vite dev —— 冲突规避


class ContractVersionMismatch(ValueError):
    """计划版本与执行合同不一致——旧计划绝不能驱动新合同。"""


def _norm_scope(s: str) -> str:
    s = s.replace("workspace/", "").strip("/")
    return s + "/" if s else ""


def build_plan(task: TaskEnvelope, rules: list[dict[str, Any]]) -> dict[str, Any]:
    """plan-lite：合同的 goal → 单个 draft 候选，BaselinePolicy 按规则/范围/风险裁决。
    真正的开放理解在 Octop agent 的执行 turn 里；这里只回答"合同本身能不能走"。"""
    candidate = CandidateAction(
        id=f"{task.task_id}_a0",
        kind="draft",
        risk_level="medium",
        parameters={"instruction": task.goal},
        evidence_refs=tuple(task.evidence_refs),
    )
    state = DecisionState(
        task_id=task.task_id,
        goal=task.goal,
        missing_information=tuple(task.redacted_state.get("missing_information", ())),
    )
    constraints = DecisionConstraints(
        allowed_scopes=tuple(_norm_scope(s) for s in task.allowed_scopes),
        forbidden_actions=tuple(task.forbidden_actions),
    )
    result = BaselinePolicy().evaluate(state, [candidate], constraints)
    # 用户在合同里声明了确认点 → 计划先停在 needs_confirmation，由用户决定是否执行。
    # 只提升 select，不覆盖 blocked/ask_user：禁止与信息缺口永远优先于"确认"。
    requires_confirmation = result.requires_confirmation or bool(task.confirmation_points)
    verdict = result.verdict
    if verdict == "select" and requires_confirmation:
        verdict = "needs_confirmation"
    plan = PlanEnvelope(
        trace_id=task.trace_id,
        task_id=task.task_id,
        contract_version=task.contract_version,
        policy_version=result.policy_version,
        candidates=[candidate.to_dict()],
        verdict=verdict,
        selected_action=result.selected_action,
        reason=result.reason,
        missing_information=list(result.missing_information),
        rule_refs=list(result.rule_refs),
        requires_confirmation=requires_confirmation,
        network_policy=task.network_policy,
    )
    return plan.to_dict()


def execute(plan_dict: dict[str, Any], body: dict[str, Any]) -> dict[str, Any]:
    octop_cfg = body["octop"]
    plan = PlanEnvelope(**{k: (v if not isinstance(v, list) else v)
                           for k, v in plan_dict.items()})
    # 合同版本校验：旧计划不能驱动新合同（args 为空的 body 不校验，便于直连调试）。
    envelope_version = body.get("contract_version")
    if envelope_version is not None and int(envelope_version) != plan.contract_version:
        raise ContractVersionMismatch(
            f"contract_version_mismatch: plan={plan.contract_version} body={envelope_version}"
        )
    client = OctopHttpClient(
        base_url=octop_cfg["base_url"],
        username=octop_cfg["username"],
        password=octop_cfg["password"],
        allow_remote=bool(octop_cfg.get("allow_remote", False)),
    )
    # 预检：agent 上所有已挂载的搜索工具都必须在 HITL 清单里。
    # 只检查 network_policy 里配置的 provider 不够——agent 可能挂了别的搜索工具，
    # 那些工具会被模型直接调用，绕过 Org Engine 的隐私检查。
    agent_id = octop_cfg.get("agent_id")
    if not agent_id:
        ensured = client.ensure_agent({"name": octop_cfg.get("agent_name", "personal"),
                                       "config": octop_cfg.get("agent_config", {})})
        agent_id = ensured["agent_id"]

    report = client.agent_preflight(agent_id, required_tools=(), gate_all_search_tools=True)
    if not report.ok:
        raise OctopPreflightError(report.detail)
    rules = [rule_from_dict(r) for r in body.get("rules", [])]
    runner = PersonalRunner(
        client, agent_id,
        workspace_root=Path(octop_cfg["workspace_root"]),
        allowed_scopes=tuple(body.get("allowed_scopes", ())),
    )
    report = runner.run(
        task_id=plan.task_id,
        goal=str((plan.candidates[0].get("parameters") or {}).get("instruction", plan.task_id)),
        rules=rules,
        confirmation_token=body.get("confirmation_token"),
        thread_id=body.get("thread_id"),
        timeout_s=body.get("timeout_s"),
        network_policy=plan.network_policy,
    )
    return {
        "status": report.status,
        "error": report.error,
        "final_text": report.final_text,
        "overall_verification": report.overall_verification,
        "events": report.events,
        "receipts": report.receipts,
        "verifications": report.verifications,
        "hitl_log": report.hitl_log,
        "search_decisions": report.search_decisions,
        "search_receipts": report.search_receipts,
    }


def verify(body: dict[str, Any]) -> dict[str, Any]:
    """TS 侧持有回执时的独立复核：只认本地磁盘事实。"""
    from .tools.verifiers import verify_create_draft, verify_read_file

    root = Path(body["workspace_root"])
    results = []
    for r in body.get("receipts", []):
        tool = r.get("tool_name", "")
        args = r.get("args") if isinstance(r.get("args"), dict) else {}
        if "_unparsed_args" in args:
            rel = ""  # 流片段残缺 → 定位不到 → 落 unverifiable 分支
        else:
            rel = str(args.get("path") or args.get("file_path") or "").lstrip("/")
        p = root / rel
        if tool in ("write_file", "edit_file"):
            v = verify_create_draft(str(p))
        elif tool == "read_file":
            v = verify_read_file(str(p), content_hash_at_read=None)
        else:
            continue
        results.append({"event_id": r.get("event_id"), "tool": tool,
                        "status": v.status, "checks": v.checks, "reason": v.reason})
    if not results:
        return {"overall": "unverifiable", "results": results}
    statuses = {r["status"] for r in results}
    overall = ("verified" if statuses == {"verified"}
               else "failed" if "failed" in statuses else "executed_unverified")
    return {"overall": overall, "results": results}


def run_eval(body: dict[str, Any]) -> dict[str, Any]:
    """个人回归集评估。空集 → not_ready（没有覆盖度就不能声称可用）。"""
    from .eval_runner import EvalCase, EvalOutcome, EvalRunner

    cases = [
        EvalCase(
            id=str(c["id"]),
            input=dict(c.get("input", {})),
            expected=dict(c.get("expected_behavior", c.get("expected", {}))),
            sensitivity=str(c.get("sensitivity", "normal")),
            enabled=bool(c.get("enabled", True)),
        )
        for c in body.get("cases", [])
    ]
    outcomes = [
        EvalOutcome(
            case_id=str(o["case_id"]),
            asked=[str(x) for x in o.get("asked", [])],
            actions=[dict(a) for a in o.get("actions", [])],
            evidence_cited=[str(x) for x in o.get("evidence_cited", [])],
            violations=[str(x) for x in o.get("violations", [])],
        )
        for o in body.get("outcomes", [])
    ]
    return {"report": EvalRunner(cases).evaluate(outcomes).to_dict()}


def run_replay(body: dict[str, Any]) -> dict[str, Any]:
    from .replay import ReplayRecord, replay_from

    record = ReplayRecord.from_dict(dict(body["record"]))
    return {"events": replay_from(record, int(body.get("from_step", 0)))}


def run_replay_compare(body: dict[str, Any]) -> dict[str, Any]:
    from .replay import ReplayRecord, compare_replays

    old = ReplayRecord.from_dict(dict(body["old"]))
    new = ReplayRecord.from_dict(dict(body["new"]))
    return {"diff": compare_replays(old, new)}


def run_simulate(body: dict[str, Any]) -> dict[str, Any]:
    """沙盒模拟：写操作重定向到临时目录，永不产生真实完成证据。"""
    from .sandbox import SandboxCall, SandboxRun

    contract = dict(body["contract"])
    calls = [
        SandboxCall(tool=str(c["tool"]), parameters=dict(c.get("parameters", {})))
        for c in body.get("calls", [])
    ]
    run = SandboxRun(contract, calls)
    try:
        result = run.execute()
        return {"simulation": result.to_dict()}
    finally:
        run.cleanup()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # 静默：标准 error 输出已足够
        pass

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(200, {"ok": True})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid json"})
            return
        try:
            if self.path == "/v1/plan":
                task = TaskEnvelope(**body["task"])
                self._json(200, {"plan": build_plan(task, body.get("rules", []))})
            elif self.path == "/v1/execute":
                self._json(200, execute(body["plan"], body))
            elif self.path == "/v1/verify":
                self._json(200, {"verification": verify(body)})
            elif self.path == "/v1/eval":
                self._json(200, run_eval(body))
            elif self.path == "/v1/replay":
                self._json(200, run_replay(body))
            elif self.path == "/v1/replay/compare":
                self._json(200, run_replay_compare(body))
            elif self.path == "/v1/simulate":
                self._json(200, run_simulate(body))
            else:
                self._json(404, {"error": "not found"})
        except KeyError as e:
            self._json(400, {"error": f"missing field {e}"})
        except ContractVersionMismatch as e:
            self._json(400, {"error": "contract_version_mismatch", "detail": str(e)})
        except OctopPreflightError as e:
            self._json(503, {"error": "octop_not_ready", "detail": str(e), "recoverable": True})
        except PermissionError as e:
            self._json(403, {"error": str(e), "recoverable": True, "needs_reconfirmation": True})
        except Exception as e:  # noqa: BLE001 — 单层边界，错误不静默
            self._json(500, {"error": f"{type(e).__name__}: {e}"})


def serve(port: int | None = None) -> ThreadingHTTPServer:
    if port is None:
        port = int(os.environ.get("PERSONAL_SERVICE_PORT", DEFAULT_PORT))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"personal decision service on 127.0.0.1:{server.server_address[1]}")
    return server


if __name__ == "__main__":
    serve().serve_forever()
