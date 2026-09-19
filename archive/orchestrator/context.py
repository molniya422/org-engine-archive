import json
import os
import tempfile
from pathlib import Path
from typing import Any

# Compute context directory relative to this file: project-root/data
_HERE = Path(__file__).resolve().parent
_CONTEXT_FILE = _HERE.parent / "data" / "shared_context.json"


def _ensure_dir():
    _CONTEXT_FILE.parent.mkdir(parents=True, exist_ok=True)


def load_context() -> dict[str, Any]:
    _ensure_dir()
    if not _CONTEXT_FILE.exists():
        return _empty_context()
    try:
        return json.loads(_CONTEXT_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return _empty_context()


def save_context(ctx: dict[str, Any]):
    _ensure_dir()
    tmp = _CONTEXT_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(ctx, ensure_ascii=False, indent=2), encoding="utf-8")
    # Atomic rename (write-then-rename for consistency)
    os.replace(str(tmp), str(_CONTEXT_FILE))


def update_section(section: str, data: Any):
    ctx = load_context()
    ctx[section] = data
    save_context(ctx)


def append_to_section(section: str, entry: dict):
    ctx = load_context()
    lst = ctx.setdefault(section, [])
    lst.append(entry)
    save_context(ctx)


def clear_context():
    _ensure_dir()
    if _CONTEXT_FILE.exists():
        _CONTEXT_FILE.unlink()


def _empty_context() -> dict[str, Any]:
    return {
        "decisions": [],
        "api_contracts": [],
        "progress": {},
        "messages": [],
    }
