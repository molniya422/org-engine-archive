"""octop_ws.collect_turn 单元测试 — 脚本化帧序列驱动，不起真服务。

覆盖：
1. 流式 args 片段按 call_id 累积，与 tool_result 配对成完整回执（fragment 全量，
   弥补 trajectory 有损）。
2. hitl_required → on_hitl 决策 → resume POST（打桩记录）→ 续跑帧 → done。
3. 无 on_hitl 时默认 reject（绝不在无门禁下放行）。
4. 超时/错误路径返回 status。
"""

from __future__ import annotations

import asyncio
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from personal.adapters import octop_ws


class FakeWs:
    def __init__(self, frames: list[dict]):
        self._frames = [json.dumps(f).encode() if isinstance(f, dict) else f for f in frames]
        self.sent: list[str] = []

    async def send(self, data: str) -> None:
        self.sent.append(data)

    async def recv(self) -> bytes:
        if not self._frames:
            await asyncio.sleep(3600)
        return self._frames.pop(0)

    async def close(self) -> None:
        pass

    async def __aenter__(self) -> "FakeWs":
        return self

    async def __aexit__(self, *exc) -> None:
        pass


def _run(frames: list[dict], **kw) -> dict:
    async def go():
        fake = FakeWs(frames)
        with mock.patch.object(octop_ws.websockets, "connect",
                               lambda *a, **k: fake, create=True):
            return await octop_ws.collect_turn(
                base_url="http://127.0.0.1:8088", agent_id="A1", thread_id="T1",
                token="jwt", text="goal", **kw,
            )
    return asyncio.run(go())


class FragmentPairingTest(unittest.TestCase):
    def test_streamed_args_fragments_pair_with_result(self):
        """分片 args（call_id 关联）+ result → 完整回执，args 为解析后的 dict。"""
        out = _run([
            {"type": "tool_call_chunk", "id": "c1", "name": "write_file", "args": '{"path":'},
            {"type": "tool_call_chunk", "id": "c1", "name": "write_file", "args": '"/a.md"}'},
            {"type": "tool_result", "id": "c1", "name": "write_file", "content": "Updated file /a.md"},
            {"type": "done"},
        ])
        self.assertEqual(out["status"], "done")
        self.assertEqual(len(out["receipts"]), 1)
        r = out["receipts"][0]
        self.assertEqual(r["tool_name"], "write_file")
        self.assertEqual(r["args"], {"path": "/a.md"})
        self.assertEqual(r["result"], "Updated file /a.md")
        self.assertEqual(r["evidence"]["kind"], "tool_result")

    def test_result_via_messages_block(self):
        """tool_result 无 content 时取 messages[0]（projector 的回退规则）。"""
        out = _run([
            {"type": "tool_call_chunk", "id": "c2", "name": "ls", "args": '{"path":"/inbox"}'},
            {"type": "tool_result", "messages": [{"tool_call_id": "c2", "name": "ls", "content": "a.md"}]},
            {"type": "done"},
        ])
        self.assertEqual(out["receipts"][0]["result"], "a.md")
        self.assertEqual(out["receipts"][0]["args"], {"path": "/inbox"})

    def test_index_keyed_fragments_attach_to_nth_call(self):
        """实机形态：首块带 id，后续片段只带数字 index（OpenAI 流式约定）。"""
        out = _run([
            {"type": "tool_call_chunk", "id": "callA", "index": 0, "name": "read_file", "args": '{"file_'},
            {"type": "tool_call_chunk", "index": 0, "args": 'path":"/inbox/a.md"}'},
            {"type": "tool_call_chunk", "id": "callB", "index": 0, "name": "write_file", "args": '{"file_path":"/s.md",'},
            {"type": "tool_call_chunk", "index": 0, "args": '"append":"ok"}'},  # callB 自己的 index=0 片段
            {"type": "tool_result", "id": "callA", "name": "read_file", "content": "1 内容"},
            {"type": "tool_result", "id": "callB", "name": "write_file", "content": "Updated"},
            {"type": "done"},
        ])
        by_id = {r["call_id"]: r for r in out["receipts"]}
        self.assertEqual(by_id["callA"]["args"], {"file_path": "/inbox/a.md"})
        self.assertEqual(by_id["callA"]["result"], "1 内容")
        self.assertEqual(by_id["callB"]["args"], {"file_path": "/s.md", "append": "ok"})


class HitlGateTest(unittest.TestCase):
    def test_hitl_request_routes_to_handler_and_resumes(self):
        """hitl_required → on_hitl 决策列表 → resume SSE 续跑帧被消费 → done。"""
        decisions = []
        posts = []

        def gate(request):
            decisions.append(request)
            return [{"type": "approve"} for _ in request.get("action_requests", [])]

        def fake_post(base_url, agent_id, token, thread_id, ds):
            posts.append(ds)
            return iter([
                {"type": "tool_result", "id": "w1", "name": "write_file", "content": "Updated /a.md"},
                {"type": "done"},
            ])

        frames = [
            {"type": "hitl_required", "request": {
                "action_requests": [{"name": "write_file", "args": {"file_path": "/a.md", "content": "x"}}],
                "review_configs": [{"action_name": "write_file", "allowed_decisions": ["approve", "reject"]}],
            }},
        ]
        async def go():
            fake = FakeWs(frames)
            with mock.patch.object(octop_ws.websockets, "connect",
                                   lambda *a, **k: fake, create=True), \
                 mock.patch.object(octop_ws, "_post_resume", fake_post):
                return await octop_ws.collect_turn(
                    base_url="http://127.0.0.1:8088", agent_id="A1", thread_id="T1",
                    token="jwt", text="goal", on_hitl=gate,
                )
        out = asyncio.run(go())
        self.assertEqual(len(decisions), 1)
        self.assertEqual(posts, [[{"type": "approve"}]])
        self.assertEqual(out["hitl_log"][0]["decisions"], [{"type": "approve"}])
        self.assertEqual(out["status"], "done")
        # 续跑 SSE 里的 tool_result 被消费成回执，且 args 来自审批权威参数
        self.assertEqual(len(out["receipts"]), 1)
        self.assertEqual(out["receipts"][0]["tool_name"], "write_file")
        self.assertEqual(out["receipts"][0]["args"], {"file_path": "/a.md", "content": "x"})

    def test_no_handler_means_reject_never_execute(self):
        """没有门禁回调 → 默认 reject——绝不在无人决策时放行工具执行。"""
        posts = []

        def fake_post(base_url, agent_id, token, thread_id, ds):
            posts.append(ds)
            return iter([{"type": "done"}])

        frames = [
            {"type": "hitl_required", "request": {"action_requests": [{"name": "write_file", "args": {}}]}},
        ]
        async def go():
            fake = FakeWs(frames)
            with mock.patch.object(octop_ws.websockets, "connect",
                                   lambda *a, **k: fake, create=True), \
                 mock.patch.object(octop_ws, "_post_resume", fake_post):
                return await octop_ws.collect_turn(
                    base_url="http://127.0.0.1:8088", agent_id="A1", thread_id="T1",
                    token="jwt", text="goal",
                )
        out = asyncio.run(go())
        self.assertEqual(posts[0][0]["type"], "reject")
        self.assertIn("审批处理", posts[0][0]["message"])

    def test_error_chunk_sets_status_and_error(self):
        out = _run([{"type": "error", "message": "model unavailable"}])
        self.assertEqual(out["status"], "error")
        self.assertEqual(out["error"], "model unavailable")
        self.assertEqual(out["receipts"], [])

    def test_final_text_accumulates_tokens(self):
        out = _run([
            {"type": "token", "content": "你好"},
            {"type": "token", "content": "，世界"},
            {"type": "done"},
        ])
        self.assertEqual(out["final_text"], "你好，世界")


class StreamDeadlineTest(unittest.TestCase):
    def test_long_idle_between_chunks_does_not_abort_turn(self):
        """本地模型思考慢：chunk 间隔超过旧的 30s 固定空闲上限也应继续。

        这里把 30s 压成 0.05s 做等价验证——只要总 deadline 未到，空闲不应终止。
        """
        async def slow_frames():
            yield {"type": "token", "content": "思考中"}
            await asyncio.sleep(0.08)   # > 0.05，旧实现会在这里放弃
            yield {"type": "token", "content": "，完成"}
            yield {"type": "done"}

        async def go():
            gen = slow_frames()
            async def get_frame():
                try:
                    return await gen.__anext__()
                except StopAsyncIteration:
                    return None

            state = octop_ws._TurnState()
            await octop_ws._consume(
                state, get_frame, gate=None, resume_ctx=None,
                deadline=asyncio.get_event_loop().time() + 5,
            )
            return state

        state = asyncio.run(go())
        self.assertEqual(state.status, "done")
        self.assertEqual("".join(state.text_parts), "思考中，完成")

    def test_total_deadline_still_bounds_the_turn(self):
        """总 deadline 仍是硬上限：永不返回的流必须被截断。"""
        async def go():
            async def get_frame():
                await asyncio.sleep(3600)

            state = octop_ws._TurnState()
            await octop_ws._consume(
                state, get_frame, gate=None, resume_ctx=None,
                deadline=asyncio.get_event_loop().time() + 0.05,
            )
            return state

        state = asyncio.run(go())
        self.assertEqual(state.status, "timeout")

    def test_timeout_sends_cancel_frame(self):
        """超时后必须向 Octop 发 cancel，否则后端 turn 会继续占用算力。"""
        sent: list[str] = []

        async def go():
            fake = FakeWs([])  # 立即让 recv 挂起 → 触发 deadline
            original_send = fake.send

            async def tracking_send(data: str) -> None:
                sent.append(data)
                await original_send(data)

            fake.send = tracking_send  # type: ignore[method-assign]
            with mock.patch.object(octop_ws.websockets, "connect",
                                   lambda *a, **k: fake, create=True):
                return await octop_ws.collect_turn(
                    base_url="http://127.0.0.1:8088", agent_id="A1", thread_id="T1",
                    token="jwt", text="goal", timeout_s=0.15,
                )

        out = asyncio.run(go())
        self.assertEqual(out["status"], "timeout")
        frames = [json.loads(s) for s in sent]
        self.assertTrue(
            any(f.get("type") == "cancel" and f.get("thread_id") == "T1" for f in frames),
            f"no cancel frame sent; frames={frames}",
        )


class SyncWrapperTest(unittest.TestCase):
    def test_run_turn_works_inside_running_event_loop(self):
        """run_turn 在已有事件循环里不能再直接 asyncio.run——须走专用线程。"""
        from personal.adapters.octop_http import OctopHttpClient

        client = OctopHttpClient("http://127.0.0.1:8088", "u", "p", timeout_s=1)
        client._token = "jwt"

        async def fake_turn(**kwargs):
            return {"status": "done", "error": None, "final_text": "ok",
                    "receipts": [], "hitl_log": []}

        async def go():
            client.run_turn_async = fake_turn  # type: ignore[method-assign]
            # 若仍用 asyncio.run，这里会抛 RuntimeError
            return client.run_turn("A1", "T1", "goal", timeout_s=1)

        out = asyncio.run(go())
        self.assertEqual(out["status"], "done")

    def test_run_turn_works_without_running_loop(self):
        from personal.adapters.octop_http import OctopHttpClient

        client = OctopHttpClient("http://127.0.0.1:8088", "u", "p", timeout_s=1)
        client._token = "jwt"

        async def fake_turn(**kwargs):
            return {"status": "done", "error": None, "final_text": "ok",
                    "receipts": [], "hitl_log": []}

        client.run_turn_async = fake_turn  # type: ignore[method-assign]
        out = client.run_turn("A1", "T1", "goal", timeout_s=1)
        self.assertEqual(out["status"], "done")


if __name__ == "__main__":
    unittest.main()
