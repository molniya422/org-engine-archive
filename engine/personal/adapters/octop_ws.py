"""Octop WS turn collector — 从 live 流累积完整回执（trajectory 的 args 有损）。

实机验证的帧事实（octop-live-spike.md）：
- tool_call_chunk：args 以流式 JSON 片段到达；首块带 id（call_id），后续片段只带
  数字 index（OpenAI 流式约定：第 n 个 id 首块 ↔ index n）。两类键都要收。
- tool_result：call_id=id|tool_call_id|messages[0].tool_call_id；result=content|messages[0].content
- **write 等被审批的工具：暂停时 WS 先发 hitl_required 再发 done；续跑 chunk 不走
  原 WS 段，而在 hitl/resume 的 SSE 响应里**——收集器必须消费 resume SSE。
- hitl_required.request.action_requests[].args 是完整参数（审批展示用），作为
  该调用的权威 args 覆盖流式累积。

门禁协议：hitl_required → on_hitl(request) 返回与 action_requests 等长的决策列表
→ POST resume → 消费其 SSE 直到 done/error（可能再次 hitl_required，递归处理）。
"""

from __future__ import annotations

import asyncio
import json
import time
import urllib.request
from typing import Any, Callable

from ..protocols.octop import ToolReceipt, from_trajectory_event

try:  # 运行时依赖（anaconda 自带）；缺失时仅 WS 功能不可用，import 不炸
    import websockets
except ImportError:  # pragma: no cover - 测试环境打桩
    websockets = None  # type: ignore[assignment]

ResumeDecision = dict[str, Any]


def _ws_url(base_url: str, agent_id: str, token: str) -> str:
    ws_base = base_url.replace("http://", "ws://").replace("https://", "wss://")
    return f"{ws_base}/api/agents/{agent_id}/chat/ws?token={token}"


def _post_resume(base_url: str, agent_id: str, token: str, thread_id: str,
                 decisions: list[ResumeDecision]) -> Any:
    """POST hitl/resume 并以迭代器形式返回其 SSE chunk 流（含续跑的完整 chunk）。"""
    req = urllib.request.Request(
        f"{base_url}/api/agents/{agent_id}/chat/hitl/resume",
        data=json.dumps({"thread_id": thread_id, "decisions": decisions}).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    resp = urllib.request.urlopen(req, timeout=120)
    return _iter_sse(resp)


def _iter_sse(resp: Any):
    """极简 SSE 解析：event: chunk\\ndata: {...}\\n\\n → yield dict。"""
    import io

    buf = io.BytesIO()
    while True:
        piece = resp.read1(4096) if hasattr(resp, "read1") else resp.read(4096)
        if not piece:
            break
        buf.write(piece)
        data = buf.getvalue()
        while b"\n\n" in data:
            block, data = data.split(b"\n\n", 1)
            buf = io.BytesIO(data)
            for line in block.split(b"\n"):
                if line.startswith(b"data: "):
                    try:
                        yield json.loads(line[6:].decode("utf-8"))
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        continue


def _result_fields(chunk: dict[str, Any]) -> tuple[str, str, Any]:
    msgs = chunk.get("messages") or []
    first = msgs[0] if isinstance(msgs, list) and msgs and isinstance(msgs[0], dict) else {}
    call_id = chunk.get("id") or chunk.get("tool_call_id") or first.get("tool_call_id") or ""
    name = chunk.get("name") or first.get("name") or "tool"
    result = chunk.get("content")
    if result is None:
        result = first.get("content")
    return str(call_id), str(name), result


class _TurnState:
    """一个 turn 的累积状态：调用顺序、args 片段（双键）、结果、审批权威参数。"""

    def __init__(self) -> None:
        self.call_order: list[str] = []          # call_id 按首块出现顺序
        self.args_text: dict[str, str] = {}      # call_id -> 累积 args JSON
        self.names: dict[str, str] = {}
        self.results: dict[str, dict[str, Any]] = {}
        self.hitl_args: dict[str, dict[str, Any]] = {}  # tool name -> 权威 args
        self.idx_owner: dict[int, str] = {}      # 流式 index -> 所属 call_id（跨调用各自归位）
        self.text_parts: list[str] = []
        self.hitl_log: list[dict[str, Any]] = []
        self.status = "timeout"
        self.error: str | None = None

    def observe(self, chunk: dict[str, Any]) -> str | None:
        """处理一帧；返回终止类型（done/error）或 None。"""
        ctype = chunk.get("type")
        if ctype == "tool_call_chunk":
            cid = str(chunk.get("id") or chunk.get("call_id") or "")
            if cid:
                if cid not in self.args_text:
                    self.call_order.append(cid)
                if chunk.get("name"):
                    self.names[cid] = str(chunk["name"])
                self.args_text[cid] = self.args_text.get(cid, "") + (chunk.get("args") or "")
                idx = chunk.get("index")
                if isinstance(idx, int):
                    # 首块带 id + index：登记该 index 归属，后续 index 片段才不跨调用串门
                    self.idx_owner[idx] = cid
            else:
                idx = chunk.get("index")
                if isinstance(idx, int):
                    owner = self.idx_owner.get(idx)
                    if owner is not None:
                        self.args_text[owner] = self.args_text.get(owner, "") + (chunk.get("args") or "")
            return None
        if ctype == "tool_result":
            call_id, name, result = _result_fields(chunk)
            if call_id:
                if call_id not in self.args_text:
                    # 未见过首块（WS 丢片段/纯审批路径）：补位入册，args 交给
                    # hitl 权威参数或 result 兜底。
                    self.call_order.append(call_id)
                    self.args_text.setdefault(call_id, "")
                if name not in ("", "tool"):
                    self.names.setdefault(call_id, name)
                self.results[call_id] = {"name": name, "result": result}
            return None
        if ctype == "token":
            if chunk.get("content"):
                self.text_parts.append(str(chunk["content"]))
            return None
        if ctype == "error":
            self.status = "error"
            self.error = str(chunk.get("message") or "unknown error")
            return "error"
        if ctype == "done":
            self.status = "done"
            return "done"
        return None

    def receipts(self, thread_id: str, agent_id: str) -> list[ToolReceipt]:
        out: list[ToolReceipt] = []
        seq = 0
        for call_id in self.call_order:
            res = self.results.get(call_id)
            if res is None:
                continue  # 未完成的调用（暂停中/被取消）不进回执
            name = res["name"] if res["name"] not in ("", "tool") else self.names.get(call_id, "tool")
            raw_args: Any
            if name in self.hitl_args:
                raw_args = self.hitl_args[name]
            elif self.args_text.get(call_id):
                try:
                    raw_args = json.loads(self.args_text[call_id])
                except json.JSONDecodeError:
                    raw_args = {"_unparsed_args": self.args_text[call_id][:2000]}
            else:
                raw_args = None
            seq += 1
            out.append(from_trajectory_event({
                "event_id": f"live:{thread_id}:{call_id}",
                "thread_id": thread_id,
                "agent_id": agent_id,
                "seq": seq,
                "ts": time.time(),
                "kind": "tool",
                "is_error": False,
                "summary": f"tool {name}",
                "payload": {"call_id": call_id, "name": name, "args": raw_args, "result": res["result"]},
            }))
        return out


async def _consume(
    state: _TurnState,
    get_frame: Callable[[], Any],
    *,
    gate: Callable[[dict], list[ResumeDecision]] | None,
    resume_ctx: tuple[str, str, str, str] | None,  # base_url, agent_id, token, thread_id
    deadline: float,
) -> None:
    """消费一个 chunk 流（WS 或 resume SSE），遇到 hitl_required 则决策+续流。

    超时只由总 deadline 决定：本地模型常常思考远超 30 秒，固定空闲上限会
    误杀正常回合（实机风险）。stream 关闭/错误仍立即终止。
    """
    loop = asyncio.get_event_loop()
    while True:
        remaining = deadline - loop.time()
        if remaining <= 0:
            return
        try:
            chunk = await asyncio.wait_for(get_frame(), timeout=remaining)
        except asyncio.TimeoutError:
            return
        if chunk is None:
            return
        stop = state.observe(chunk)
        if stop:
            return
        if chunk.get("type") == "hitl_required":
            request = chunk.get("request") or {}
            n = max(1, len(request.get("action_requests") or []))
            for req in request.get("action_requests", []):
                if isinstance(req.get("args"), dict):
                    state.hitl_args[str(req.get("name", ""))] = req["args"]
            decisions = (
                await asyncio.to_thread(gate, request)
                if gate is not None
                else [{"type": "reject", "message": "没有可用的审批处理，已拒绝。"}] * n
            )
            if len(decisions) != n:
                decisions = (list(decisions) + [{"type": "reject", "message": "决策数与待审批动作数不一致。"}] * n)[:n]
            state.hitl_log.append({"request": request, "decisions": decisions})
            base_url, agent_id, token, thread_id = resume_ctx  # type: ignore[misc]
            sse = await asyncio.to_thread(
                _post_resume, base_url, agent_id, token, thread_id, decisions,
            )
            await _consume(state, _sse_frame_getter(sse), gate=gate, resume_ctx=resume_ctx,
                           deadline=deadline)
            return


def _chunks_from(source: Any):
    """resume 响应两种形态：HTTP 响应（SSE 解析）或已解析的 chunk 迭代器（测试桩）。"""
    if hasattr(source, "read") or hasattr(source, "read1"):
        yield from _iter_sse(source)
    else:
        yield from source


def _sse_frame_getter(sse: Any):
    queue: asyncio.Queue = asyncio.Queue()

    def pump() -> None:
        try:
            for chunk in _chunks_from(sse):
                queue.put_nowait(chunk)
        except OSError:
            pass
        finally:
            queue.put_nowait(None)

    threading_pid = None
    import threading

    threading_pid = threading.Thread(target=pump, daemon=True)
    threading_pid.start()

    async def get_frame():
        # 不设 idle 上限：本地模型续跑可能长时间无 chunk，总 deadline 由 _consume 管。
        # 流关闭时 pump 会放入 None。
        return await queue.get()

    return get_frame


async def collect_turn(
    *,
    base_url: str,
    agent_id: str,
    thread_id: str,
    token: str,
    text: str,
    on_hitl: Callable[[dict], list[ResumeDecision]] | None = None,
    hitl_policy: dict | None = None,
    timeout_s: float = 900.0,
) -> dict[str, Any]:
    if websockets is None:
        raise RuntimeError("websockets package required for Octop WS transport")
    frame: dict[str, Any] = {"type": "user_turn", "thread_id": thread_id, "text": text}
    if hitl_policy is not None:
        frame["hitl_policy"] = hitl_policy

    state = _TurnState()

    async with websockets.connect(_ws_url(base_url, agent_id, token),
                                  max_size=None, open_timeout=30) as ws:
        await ws.send(json.dumps({"type": "subscribe", "thread_id": thread_id}))
        await ws.send(json.dumps(frame))

        async def ws_frame():
            raw = await ws.recv()
            try:
                return json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                return {"type": "noop"}

        loop = asyncio.get_event_loop()
        await _consume(
            state, ws_frame, gate=on_hitl,
            resume_ctx=(base_url, agent_id, token, thread_id),
            deadline=loop.time() + timeout_s,
        )

        # 超时必须主动取消后端 turn。否则 Octop 侧会继续跑完整个模型回合，
        # 同一 agent 的下一个 turn 会和残留 turn 并行抢算力（实机实测速度
        # 从 13.5 tok/s 掉到 3.3 tok/s），且状态永久显示 turn_active=true。
        if state.status == "timeout":
            try:
                await ws.send(json.dumps({"type": "cancel", "thread_id": thread_id}))
                # 给服务端一点时间落取消状态，再断开。
                await asyncio.sleep(0.5)
            except Exception:  # noqa: BLE001 — 取消失败不能掩盖超时本身
                pass

    receipts = state.receipts(thread_id, agent_id)
    return {
        "status": state.status,
        "error": state.error,
        "final_text": "".join(state.text_parts),
        "receipts": [
            {
                "event_id": r.event_id, "call_id": r.call_id, "tool_name": r.tool_name,
                "args": r.args, "result": r.result, "is_error": r.is_error,
                "evidence": _evidence_of(r),
            }
            for r in receipts
        ],
        "hitl_log": state.hitl_log,
    }


def _evidence_of(r: ToolReceipt) -> dict[str, Any]:
    from ..protocols.octop import to_evidence

    return to_evidence(r)
