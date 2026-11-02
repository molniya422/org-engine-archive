"""Real Octop transport (P4.4 第二阶段) — HTTP + WS 客户端，对接运行中的 Octop。

接口事实全部来自实机验证（editor/docs/integration/octop-live-spike.md，v1.0.2b5）：
- POST /api/auth/login {username,password} → {access_token}（HTTP 用 Bearer，WS 用 ?token=）
- WS  /api/agents/{agent_id}/chat/ws?token=<jwt>；帧 user_turn / tool_call_chunk /
      tool_result / hitl_required / done / error（每帧带 thread_id）
- POST /api/agents/{agent_id}/chat/hitl/resume {thread_id, decisions} → SSE
- GET  /api/agents/{agent_id}/threads/{thread_id}/trajectory — kind="tool"，
      payload {call_id,name,args(,result)}；列表端点对 args/result 截断，取全量用 event detail

两条红线（与 fake adapter 一致）：
- 默认只允许 loopback endpoint（复用 model_types 的约定，显式 allow_remote 才放开）；
- 连接/版本/权限失败映射为可恢复状态，绝不猜成功。

WS 侧注意：trajectory 是有损账本（流式 args 只留首片段），**验证用回执必须从
live WS 流累积完整 args**（按 call_id 配对 tool_result），trajectory 只作持久审计。
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable
from urllib.parse import urlparse

from .octop import OCTOP_PROTOCOL_VERSION, OctopConnectionError

LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}
DEFAULT_TURN_TIMEOUT_S = 900.0


def _validate_loopback(base_url: str, allow_remote: bool) -> None:
    host = (urlparse(base_url).hostname or "").lower()
    if host not in LOOPBACK_HOSTS and not allow_remote:
        raise OctopConnectionError(
            f"refusing non-loopback Octop endpoint {base_url}: pass allow_remote=True explicitly"
        )


@dataclass(frozen=True)
class AgentPreflight:
    """启动前自检结果：工具是否真的存在、是否真的被 HITL 拦住。

    为什么要检查"是否被 HITL 拦住"：Org Engine 的搜索隐私策略挂在
    runner 的 on_hitl 回调上。若 Octop 不把该工具纳入 HITL，工具会被
    直接执行，策略根本没有执行点。
    """

    ok: bool
    agent_id: str
    tool_count: int = 0
    missing_tools: list[str] = field(default_factory=list)
    tools_outside_hitl: list[str] = field(default_factory=list)
    detail: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok, "agent_id": self.agent_id, "tool_count": self.tool_count,
            "missing_tools": list(self.missing_tools),
            "tools_outside_hitl": list(self.tools_outside_hitl),
            "detail": self.detail,
        }


class OctopPreflightError(RuntimeError):
    """预检失败：不要在配置不一致时启动任务。"""


class OctopHttpClient:
    """Synchronous HTTP client for a running Octop server (loopback)."""

    def __init__(
        self,
        base_url: str,
        username: str,
        password: str,
        *,
        allow_remote: bool = False,
        timeout_s: float = 30.0,
        expected_version: str = OCTOP_PROTOCOL_VERSION,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.allow_remote = allow_remote
        self.timeout_s = timeout_s
        self.expected_version = expected_version
        self._token: str | None = None
        _validate_loopback(self.base_url, allow_remote)

    # -- low level -----------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        if not self._token:
            self.login()
        return {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"}

    def login(self) -> None:
        body = json.dumps({"username": self.username, "password": self.password}).encode()
        req = urllib.request.Request(
            f"{self.base_url}/api/auth/login", data=body,
            headers={"Content-Type": "application/json"}, method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                self._token = str(json.loads(resp.read().decode("utf-8"))["access_token"])
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            raise OctopConnectionError(f"octop login failed at {self.base_url}: {e}") from e

    def _request(self, path: str, method: str = "GET", payload: dict | None = None) -> Any:
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(
            f"{self.base_url}{path}", data=data, headers=self._headers(), method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                body = resp.read().decode("utf-8", "replace")
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            if e.code == 401:
                self._token = None
                req = urllib.request.Request(
                    f"{self.base_url}{path}", data=data, headers=self._headers(), method=method,
                )
                with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                    return json.loads(resp.read().decode("utf-8") or "{}")
            detail = e.read().decode("utf-8", "replace")[:200]
            if e.code == 403:
                raise PermissionError(f"octop forbidden: {detail}") from e
            raise OctopConnectionError(f"octop {method} {path} -> HTTP {e.code}: {detail}") from e
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            raise OctopConnectionError(f"octop unreachable ({method} {path}): {e}") from e

    # -- health / version ----------------------------------------------------

    def health(self) -> bool:
        req = urllib.request.Request(f"{self.base_url}/api/health")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                return bool(json.loads(resp.read().decode("utf-8")).get("ok"))
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
            return False

    def server_version(self) -> str:
        """实测：/api/health 不含版本；版本以适配器期望值+首次成功通信为准。
        这里返回 expected_version 的探测占位——版本门禁由 adapters/octop._check_version
        在 transport.protocol_version 属性上完成。"""
        return self.expected_version

    # -- agent / thread management -------------------------------------------

    def ensure_agent(self, spec: dict[str, Any]) -> dict[str, Any]:
        """按 name 找 agent，缺失则创建（config 支持 backend/tools_disabled/security），
        然后 start。返回 {agent_id, state}。"""
        name = spec["name"]
        agents = self._request("/api/agents?scope=all")
        rows = agents if isinstance(agents, list) else agents.get("agents", [])
        for row in rows:
            if row.get("name") == name:
                agent_id = row["agent_id"]
                break
        else:
            created = self._request(
                "/api/agents", "POST",
                {"name": name, "config": spec.get("config", {})},
            )
            agent_id = created["agent_id"]
        state = self._request(f"/api/agents/{agent_id}/status").get("state")
        if state != "running":
            self._request(f"/api/agents/{agent_id}/start", "POST")
            state = self._request(f"/api/agents/{agent_id}/status").get("state")
        return {"agent_id": agent_id, "state": state}

    def create_thread(self, agent_id: str) -> str:
        return str(self._request(f"/api/agents/{agent_id}/threads", "POST")["thread_id"])

    def thread_active(self, agent_id: str, thread_id: str) -> bool:
        hist = self._request(f"/api/agents/{agent_id}/threads/{thread_id}/history?limit=1")
        return bool(hist.get("turn_active"))

    def hitl_pending(self, agent_id: str, thread_id: str) -> dict | None:
        """重启/断线后恢复：GET history → hitl_pending（action_requests+review_configs）。"""
        hist = self._request(f"/api/agents/{agent_id}/threads/{thread_id}/history?limit=1")
        return hist.get("hitl_pending") or None

    # -- receipts --------------------------------------------------------------

    def trajectory_events(self, agent_id: str, thread_id: str, limit: int = 200) -> list[dict]:
        out = self._request(f"/api/agents/{agent_id}/threads/{thread_id}/trajectory?limit={limit}")
        return list(out.get("events", []))

    def trajectory_event(self, agent_id: str, thread_id: str, event_id: str) -> dict:
        return self._request(f"/api/agents/{agent_id}/threads/{thread_id}/trajectory/events/{event_id}")

    def read_tool_receipt(self, receipt_id: str, agent_id: str, thread_id: str) -> dict:
        ev = self.trajectory_event(agent_id, thread_id, receipt_id)
        if ev.get("kind") != "tool":
            raise OctopConnectionError(f"event {receipt_id} is kind={ev.get('kind')!r}, not a tool receipt")
        return ev

    # -- preflight -------------------------------------------------------------

    def agent_tool_names(self, agent_id: str) -> set[str]:
        """该 agent 实际挂载的 builtin 工具名（来自 tool-settings 端点）。"""
        out = self._request(f"/api/agents/{agent_id}/tool-settings")
        tools = out.get("tools") if isinstance(out, dict) else None
        if not isinstance(tools, list):
            return set()
        return {
            str(t["name"]) for t in tools
            if isinstance(t, dict) and t.get("enabled") and t.get("available", True)
        }

    def global_hitl_tools(self) -> set[str]:
        """全局 HITL 策略的生效工具集。

        policy 里 ``tools: "default"`` 表示使用 harness 内置默认集
        （bash/execute/write_file/edit_file/delete），需要展开成具体名字。
        """
        out = self._request("/api/admin/security")
        hitl = out.get("hitl") if isinstance(out, dict) else None
        if not isinstance(hitl, dict) or not hitl.get("enabled"):
            return set()
        raw = hitl.get("tools")
        if raw == "default":
            return {"bash", "execute", "write_file", "edit_file", "delete"}
        if isinstance(raw, list):
            return {str(t) for t in raw}
        return set()

    def agent_preflight(self, agent_id: str, required_tools: tuple[str, ...] = (),
                        *, gate_all_search_tools: bool = False) -> AgentPreflight:
        """核对：必需工具存在，且必须走门禁的工具都在 HITL 清单里。

        `gate_all_search_tools=True` 时，agent 上挂载的**任何**搜索/抓取工具
        都必须出现在 HITL 清单里——否则它们会被直接执行，绕过 Org Engine 的
        隐私检查。
        """
        present = self.agent_tool_names(agent_id)
        gated = self.global_hitl_tools()

        missing = [t for t in required_tools if t not in present]

        if gate_all_search_tools:
            from ..search_policy import all_search_tool_names
            must_gate = [t for t in all_search_tool_names() if t in present]
        else:
            must_gate = list(required_tools)

        outside = [t for t in must_gate if t not in gated]
        ok = not missing and not outside
        detail = ""
        if missing:
            detail += f"工具未挂载: {missing}. "
        if outside:
            detail += (
                f"工具未纳入 HITL: {outside}. 这些工具会被直接执行，"
                "Org Engine 的隐私/范围检查不会被调用。"
            )
        return AgentPreflight(
            ok=ok, agent_id=agent_id, tool_count=len(present),
            missing_tools=missing, tools_outside_hitl=outside, detail=detail.strip(),
        )

    def ensure_hitl_tools(self, tools: tuple[str, ...]) -> dict[str, Any]:
        """把 tools 并入全局 HITL 清单（保留既有设置）。

        这不是"放松"安全，而是"收紧密码"：让搜索工具走审批。
        """
        current = self._request("/api/admin/security")
        hitl = dict(current.get("hitl") or {})
        raw = hitl.get("tools")
        if raw == "default":
            names = ["bash", "execute", "write_file", "edit_file", "delete"]
        elif isinstance(raw, list):
            names = [str(t) for t in raw]
        else:
            names = []
        for t in tools:
            if t not in names:
                names.append(t)
        hitl["tools"] = names
        hitl["enabled"] = True
        payload = {**current, "hitl": hitl}
        return self._request("/api/admin/security", "PUT", payload)

    # -- turn execution (async core + sync wrapper) -----------------------------

    async def run_turn_async(
        self,
        agent_id: str,
        thread_id: str,
        text: str,
        *,
        on_hitl: Callable[[dict], dict] | None = None,
        hitl_policy: dict | None = None,
        timeout_s: float = DEFAULT_TURN_TIMEOUT_S,
    ) -> dict:
        """Async variant: safe to await from an existing event loop."""
        from .octop_ws import collect_turn

        if not self._token:
            await asyncio.to_thread(self.login)
        return await collect_turn(
            base_url=self.base_url, agent_id=agent_id, thread_id=thread_id,
            token=self._token or "", text=text, on_hitl=on_hitl,
            hitl_policy=hitl_policy, timeout_s=timeout_s,
        )

    def run_turn(
        self,
        agent_id: str,
        thread_id: str,
        text: str,
        *,
        on_hitl: Callable[[dict], dict] | None = None,
        hitl_policy: dict | None = None,
        timeout_s: float = DEFAULT_TURN_TIMEOUT_S,
    ) -> dict:
        """同步入口（ThreadingHTTPServer 调用路径）。

        on_hitl(request) -> decision：org-engine 门禁回调（sync），request 形如
        {"action_requests": [{"name","args","description"}], "review_configs": [...]}。
        返回 {"status": "done|error", "error": str|None, "receipts": [ToolReceipt-dict],
              "hitl_log": [{request, decision}], "final_text": str}。

        若调用方本身已在事件循环里，`asyncio.run` 会抛 RuntimeError；此时改为在
        专用线程的独立事件循环中执行（阻塞调用线程，语义仍是同步调用）。
        """
        kwargs = dict(
            agent_id=agent_id, thread_id=thread_id, text=text, on_hitl=on_hitl,
            hitl_policy=hitl_policy, timeout_s=timeout_s,
        )
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(self.run_turn_async(**kwargs))

        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(
                lambda: asyncio.run(self.run_turn_async(**kwargs))
            ).result()
