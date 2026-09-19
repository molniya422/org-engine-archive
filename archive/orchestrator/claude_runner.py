import asyncio
import os
import shutil


async def run_claude(prompt: str, worktree: str = None, model: str = None,
                     timeout: int = 600) -> str:
    """Async call to claude CLI subprocess"""
    cmd = ["claude", "--print", "-p", prompt]
    if model:
        cmd.extend(["--model", model])
    if worktree:
        cmd.extend(["--cwd", worktree])
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return "[TIMEOUT] claude CLI timed out"
    return stdout.decode("utf-8", errors="replace")


async def run_parallel(tasks: list[dict]) -> list[str]:
    """Concurrently launch multiple claude CLI processes, each in its worktree"""
    coros = [
        run_claude(t["prompt"], worktree=t.get("worktree"), model=t.get("model"))
        for t in tasks
    ]
    return await asyncio.gather(*coros)


def run_claude_sync(prompt: str, worktree: str = None, model: str = None,
                    timeout: int = 600) -> str:
    """Synchronous wrapper"""
    return asyncio.get_event_loop().run_until_complete(
        run_claude(prompt, worktree, model, timeout)
    )
