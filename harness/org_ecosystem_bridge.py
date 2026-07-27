"""org-engine ecosystem bridge — wraps the lean-hooks helper CLIs so the
organization orchestrator can drive loop-engineering, skill-attention, and
auto-summary without polluting their canonical state files.

All side effects use `org-` / `org-engine` prefixes and dedicated env vars
so existing `loop-engineering/states/*`, `training-loop/feedback.md`,
`training-loop/meta.json`, `MEMORY.md`, and the live claude-mem.db on `main`
are NEVER touched.

Each helper is a thin subprocess wrapper that surfaces timeout + JSON-or-text
result and degrades gracefully when the underlying CLI is missing / fails.
The class is injectable into `OrganizationOrchestrator` for unit testing
(monkey-patch `_Bridge` to a fake before tests).
"""
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
HARNESS_DIR = SCRIPT_DIR  # the bridge commands live alongside this file


class _Bridge:
    """Invokes a harness CLI via subprocess json-emitting if available.

    Each method is safe to call with the helper missing: returns a stub
    payload that explains the helper was unavailable, instead of raising.
    """

    def run(self, args, timeout: int = 10, env_extra: dict | None = None):
        full = [sys.executable, str(HARNESS_DIR / args[0])] + list(args[1:])
        env = os.environ.copy()
        if env_extra:
            env.update(env_extra)
        try:
            r = subprocess.run(full, capture_output=True, text=True,
                               timeout=timeout, env=env)
            return {
                "ok": r.returncode == 0,
                "code": r.returncode,
                "stdout": r.stdout.strip(),
                "stderr": r.stderr.strip(),
                "timeout": False,
            }
        except subprocess.TimeoutExpired:
            return {"ok": False, "code": -1, "stdout": "",
                    "stderr": "timeout", "timeout": True}
        except FileNotFoundError:
            return {"ok": False, "code": -1, "stdout": "",
                    "stderr": "helper not found", "timeout": False}


class EcosystemBridge(_Bridge):
    """Connects the org-engine kernel to lean-hooks helpers.

    All paths the helpers write into are confined to:
      - loop-state:  <bridge.loop_dir>/org-<sid>.json   (own dir, never lean-hooks loop-engineering/states)
      - auto-summary: <bridge.memory_data_dir>/claude-mem.db (own dir, env-isolated)
      - skill-attention feedback: passed --prompt; meta.json counts go to bridge.feedback_meta if you override
      - archive: <bridge.archive_dir>/org-<sid>-<ts>.json
    """

    def __init__(self, loop_dir: Path | None = None,
                 memory_data_dir: Path | None = None,
                 feedback_meta_dir: Path | None = None,
                 archive_dir: Path | None = None):
        self.loop_dir = loop_dir
        self.memory_data_dir = memory_data_dir
        self.feedback_meta_dir = feedback_meta_dir
        self.archive_dir = archive_dir

    # ---- loop: write/read per-cycle state ----

    def loop_write(self, pattern: str, key: str, value, states_dir: Path) -> dict:
        """Persist a per-cycle key (e.g. consecutive_failures, last_cycle_verdict).
        Uses loop-state-manager.py; writes only into the bridge.states_dir; the
        default loop-engineering/states dir is NEVER written by org-engine.
        Auto-inits the state file (helper requires it to pre-exist) and retries."""
        os.makedirs(states_dir, exist_ok=True)
        v = json.dumps(value) if not isinstance(value, str) else value
        r = self.run(["loop-state-manager.py", "write",
                      pattern, key, v,
                      "--states-dir", str(states_dir)])
        # helper refuses write when state file does not exist; init then retry once.
        if not r["ok"] and "No state for pattern" in (r["stderr"] or ""):
            self.run(["loop-state-manager.py", "init", pattern,
                      "--states-dir", str(states_dir)])
            r = self.run(["loop-state-manager.py", "write",
                          pattern, key, v,
                          "--states-dir", str(states_dir)])
        return r

    def loop_read(self, pattern: str, states_dir: Path) -> dict:
        return self.run(["loop-state-manager.py", "read",
                         pattern, "--states-dir", str(states_dir)])

    def loop_fail_check(self, pattern: str, states_dir: Path, stale_days: int = 2) -> dict:
        """Detect stuck/dead loops (>=3 consecutive fails or last_run > cadence*3).
        Note: loop-failure-detector reads from its own configured states dir, not
        the bridge's. For full bridge integration, pattern state must be co-located.
        When the CLI flag mismatch occurs, the helper returns non-zero and we degrade."""
        return self.run(["loop-failure-detector.py", "--pattern", pattern, "--json"])

    def loop_budget_check(self, budget_json: Path, remaining: float, total: float | None) -> dict:
        """Cross-check token budget via the budget.json structure expected by
        loop-budget-tracker.py. This is the token-budget hook for org-engine meetings."""
        # loop-budget-tracker.py expects session_started_consumed; for the bridge we feed a one-shot check.
        # If total not given, only remaining ratio matters.
        ratio = (remaining / total) if total and total > 0 else remaining
        return {
            "ok": True,
            "summary": {"remaining": remaining, "total": total, "ratio": ratio,
                        "needs_throttle": ratio < 0.1,
                        "needs_escalate": remaining < 0},
            "note": "computed in-process (bridge; no subprocess to avoid touching lean-hooks files)",
        }

    # ---- skill-attention ----

    def skill_recommend(self, prompt: str, top_k: int = 5, hook: bool = False) -> dict:
        """Query the skill-attention layer for the prompt; degrades silently when
        the ONNX model isn't installed (per skill-attention own design).
        Returns at least {'top_skills': [...]} on success, or {'unavailable': True}."""
        args = ["skill-attention.py", "query", "--prompt", prompt, "--top-k", str(top_k)]
        if hook:
            args.append("--hook")
        r = self.run(args, timeout=5)
        if not r["ok"]:
            return {"unavailable": True, "raw": r}
        try:
            parsed = json.loads(r["stdout"])
            return {"top_skills": parsed.get("skills") or parsed.get("matches") or parsed,
                    "raw": parsed, "echo": parsed}
        except Exception:
            return {"unavailable": True, "raw": r}

    def skill_feedback(self, skill: str, signal: str, prompt: str = "") -> dict:
        """Route a SkillOpt signal (correct/fp/miss) into the skill-attention
        feedback system. Returns wrapper with 'note' flag telling org-engine
        whether the signal was actually applied; safe to call when unavailable."""
        args = ["skill-attention.py", "feedback",
                "--skill", skill, "--signal", signal]
        if prompt:
            args.extend(["--prompt", prompt])
        r = self.run(args, timeout=5)
        return {"ok": r["ok"], "stdout": r["stdout"], "stderr": r["stderr"]}

    # ---- auto-summary + memory ----

    def archive_session(self, project: str, summary: str, files_csv: str,
                        has_substance: bool = True) -> dict:
        """Write a session summary via auto-summary.py into the bridge-own
        claude-mem.db (CLAUDE_MEM_DATA_DIR env override) so the lean-hooks
        main db is never touched."""
        if self.memory_data_dir is None:
            return {"skipped": True, "note": "no memory_data_dir configured"}
        os.makedirs(self.memory_data_dir, exist_ok=True)
        env = {"CLAUDE_MEM_DATA_DIR": str(self.memory_data_dir)}
        args = ["auto-summary.py",
                "-p", project, "-s", summary, "-f", files_csv,
                "--has-substance", "true" if has_substance else "false"]
        r = self.run(args, timeout=5, env_extra=env)
        return r

    def archive_meeting(self, session_id: str, meeting_payload: dict) -> dict:
        """Meeting archive: dump the meeting payload as a JSONL row into the
        bridge's archive_dir so it's audit-traceable without touching MEMORY.md."""
        if self.archive_dir is None:
            return {"skipped": True, "note": "no archive_dir configured"}
        os.makedirs(self.archive_dir, exist_ok=True)
        ts = meeting_payload.get("ts", "unknown")
        path = self.archive_dir / f"org-{session_id}-{ts}.json"
        # minimal row, single-line JSONL-friendly
        with open(path, "w", encoding="utf-8") as f:
            json.dump(meeting_payload, f, ensure_ascii=False, indent=2)
        return {"path": str(path), "ok": True}

    # ---- higher-level:auto dry-run summary if all helpers are unavailable ----

    def dry_run_self_check(self) -> dict:
        """Probe each helper for availability; return a dict of binaries that
        are reachable. Used at org-engine init to log which integrations are
        live vs degraded."""
        probs = {
            "loop_state_manager": self.run(["loop-state-manager.py", "--help"], timeout=2),
            "loop_failure_detector": self.run(["loop-failure-detector.py", "--help"], timeout=2),
            "skill_attention": self.run(["skill-attention.py", "--help"], timeout=2),
            "auto_summary": self.run(["auto-summary.py", "--help"], timeout=2),
        }
        return {k: v["ok"] for k, v in probs.items()}
