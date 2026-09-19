import json
import os
from pathlib import Path

_HARNESS_ROOT = Path(os.environ.get("HARNESS_ROOT", Path(__file__).resolve().parent.parent / "config"))
_CONFIG_DIR = _HARNESS_ROOT / "config" if (_HARNESS_ROOT / "config").exists() else _HARNESS_ROOT
_LOOP_DIR = _CONFIG_DIR / "training-loop" if (_CONFIG_DIR / "training-loop").exists() else _HARNESS_ROOT / "training-loop"
_HARNESS_DIR = _CONFIG_DIR / "harness" if (_CONFIG_DIR / "harness").exists() else _HARNESS_ROOT / "harness"


def get_thresholds() -> dict[str, int]:
    """Read PHASE1_TRIGGER_MIN and PHASE2_TRIGGER_MIN from multiagent-detect.sh"""
    script = _HARNESS_DIR / "multiagent-detect.sh"
    defaults = {"PHASE1_TRIGGER_MIN": 4, "PHASE2_TRIGGER_MIN": 3}
    if not script.exists():
        return defaults
    text = script.read_text(encoding="utf-8")
    import re
    for key in defaults:
        m = re.search(rf'{key}="?(\d+)"?', text)
        if m:
            defaults[key] = int(m.group(1))
    return defaults


def get_api_config() -> dict[str, str]:
    """Read API configuration from environment or settings.json"""
    return {
        "base_url": os.environ.get("ANTHROPIC_BASE_URL", ""),
        "auth_token": os.environ.get("ANTHROPIC_AUTH_TOKEN", ""),
        "model": os.environ.get("ANTHROPIC_MODEL", ""),
    }


def get_feedback_path() -> Path:
    return _LOOP_DIR / "feedback.md"


def get_meta_path() -> Path:
    return _LOOP_DIR / "meta.json"
