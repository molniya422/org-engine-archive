import os
import subprocess
from pathlib import Path

_WORKTREE_BASE = ".claude/worktrees/orchestrator"


def _repo_root() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True, text=True, timeout=10,
    )
    return result.stdout.strip()


def create_worktree(agent_id: str, base_branch: str = None) -> str:
    """Create an isolated worktree for an agent, return its absolute path"""
    root = _repo_root()
    wt_path = os.path.join(root, f"{_WORKTREE_BASE}-{agent_id}")
    branch = f"orchestrator/{agent_id}"
    base = base_branch or _current_branch()
    os.makedirs(os.path.dirname(wt_path), exist_ok=True)
    subprocess.run(
        ["git", "worktree", "add", wt_path, "-b", branch, base],
        capture_output=True, text=True, timeout=30,
    )
    return wt_path


def merge_worktree(agent_id: str) -> bool:
    """Merge agent's branch back to current branch"""
    branch = f"orchestrator/{agent_id}"
    result = subprocess.run(
        ["git", "merge", branch, "--no-ff", "-m", f"orchestrator: merge {agent_id}"],
        capture_output=True, text=True, timeout=60,
    )
    return result.returncode == 0


def cleanup_worktree(agent_id: str):
    """Remove worktree and delete branch"""
    root = _repo_root()
    wt_path = os.path.join(root, f"{_WORKTREE_BASE}-{agent_id}")
    branch = f"orchestrator/{agent_id}"
    subprocess.run(["git", "worktree", "remove", wt_path, "--force"],
                   capture_output=True, text=True, timeout=30)
    subprocess.run(["git", "branch", "-D", branch],
                   capture_output=True, text=True, timeout=10)


def list_active_worktrees() -> list[str]:
    """List all orchestrator-managed worktrees"""
    result = subprocess.run(
        ["git", "worktree", "list", "--porcelain"],
        capture_output=True, text=True, timeout=10,
    )
    return [line.split(" ", 1)[1] for line in result.stdout.splitlines()
            if line.startswith("worktree ") and "orchestrator-" in line]


def _current_branch() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        capture_output=True, text=True, timeout=10,
    )
    return result.stdout.strip() or "main"
