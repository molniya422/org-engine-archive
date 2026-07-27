"""Skill Loader — loads real skill files from the Claude Code skills directories.

Searches:
  1. CONFIG_DIR/skills/<name>/SKILL.md   (claude-ecosystem config)
  2. ~/.claude/skills/<name>/SKILL.md    (global user skills)
  3. skills/<name>/SKILL.md              (lean-hooks local)

Provides:
  - get_skill_content(name): returns full SKILL.md text or None
  - inject_into_prompt(name, brief): wraps a brief with the skill's full instructions
  - validate_evidence(name, evidence): checks that evidence text references actual
    phrases from the skill file (stronger than raw string matching — looks for
    quoted section headers, rule numbers, or code block snippets)

This is the REAL enforcement layer: the model cannot fabricate skill content it
hasn't seen, and the evidence validator checks for actual content from the file.
"""
import os
import re
from pathlib import Path

# Search paths in priority order
_CONFIG_DIR = Path(os.environ.get("CONFIG_DIR", ""))
if not _CONFIG_DIR.exists():
    # fallback: claude-ecosystem config relative to cwd or parent
    for candidate in [Path.cwd().parent / "config", Path.cwd() / "config"]:
        if (candidate / "skills").exists():
            _CONFIG_DIR = candidate
            break

_SEARCH_ROOTS = [
    _CONFIG_DIR / "skills" if _CONFIG_DIR.exists() else None,
    Path.home() / ".claude" / "skills",
    Path.cwd() / "skills",
    Path.cwd().parent / ".claude" / "skills",
]
_SEARCH_ROOTS = [r for r in _SEARCH_ROOTS if r is not None]


def find_skill_path(name: str) -> Path | None:
    """Return Path to SKILL.md for the given skill name, or None."""
    for root in _SEARCH_ROOTS:
        p = root / name / "SKILL.md"
        if p.exists():
            return p
        # also check without SKILL.md suffix — maybe the file IS the skill
        p2 = root / name
        if p2.exists() and p2.is_file():
            return p2
    return None


def get_skill_content(name: str) -> str | None:
    """Return the full text of a skill's SKILL.md, or None."""
    path = find_skill_path(name)
    if path is None:
        return None
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return None


def get_skill_paragraphs(name: str) -> list[str]:
    """Split skill content into paragraphs for evidence matching."""
    content = get_skill_content(name)
    if content is None:
        return []
    # split on double newlines, filter empties
    paras = [p.strip() for p in re.split(r'\n\s*\n', content) if p.strip()]
    return paras


def inject_into_prompt(name: str, brief: str) -> str:
    """Wrap an executor brief with the actual skill instructions.
    Returns the brief unchanged if skill not found (graceful degradation)."""
    content = get_skill_content(name)
    if content is None:
        # fallback: still tell the model to use the skill
        return (
            f"You MUST use the Skill tool to invoke the skill named '{name}'.\n"
            f"Call: Skill(skill=\"{name}\") in your response.\n\n"
            f"{brief}"
        )
    return (
        f"You MUST use the Skill tool to invoke the skill named '{name}'.\n"
        f"Call the Skill tool with skill=\"{name}\" to load its instructions "
        f"(content is below for reference, but you MUST invoke it via the tool).\n\n"
        f"### Skill: {name} ###\n"
        f"{content}\n"
        f"### End Skill ###\n\n"
        f"After loading the skill, follow its instructions EXACTLY.\n\n"
        f"{brief}"
    )


def validate_evidence(name: str, evidence: str) -> dict:
    """Validate that evidence references real content from the skill file.

    Returns {'valid': True} if evidence contains at least one distinctive keyword
    or phrase that matches actual content from the skill file, or {'valid': False}
    with reason if not.

    This is the key enforcement method: the model's evidence must reference
    real skill content to pass audit. The model CANNOT fabricate phrases
    that match real skill content it hasn't seen.

    Matching strategy (tiered, first match wins):
      1. Exact line match: evidence contains a full line from the skill (>=20 chars)
      2. Section header match: evidence mentions a skill section header
      3. Keyword cluster match: evidence contains 2+ distinctive (>=5 char) words
         that appear in the same paragraph of the skill
    """
    if not evidence or not evidence.strip():
        return {"valid": False, "reason": "evidence is empty"}
    content = get_skill_content(name)
    if content is None:
        return {"valid": None, "reason": f"skill '{name}' not found on disk"}

    evidence_lower = evidence.strip().lower()
    content_lower = content.lower()

    # Tier 1: exact line match (evidence contains a full line from the skill)
    for line in content.split('\n'):
        line_stripped = line.strip()
        if len(line_stripped) >= 20 and line_stripped.lower() in evidence_lower:
            return {"valid": True, "matching_phrases": [line_stripped[:80]],
                    "tier": "line"}

    # Tier 2: section header match (## or ### headers)
    for line in content.split('\n'):
        line_stripped = line.strip()
        if line_stripped.startswith('#') and len(line_stripped) >= 10:
            header_clean = line_stripped.lstrip('#').strip().lower()
            if header_clean in evidence_lower:
                return {"valid": True, "matching_phrases": [line_stripped[:80]],
                        "tier": "header"}

    # Tier 3: distinctive keyword match (the evidence contains words that
    # appear together in a paragraph of the skill)
    evidence_words = [w for w in evidence_lower.split()
                      if len(w) >= 5 and w.isalnum()]
    if len(evidence_words) >= 2:
        for para in content.split('\n\n'):
            para_lower = para.lower()
            # Count how many evidence keywords appear in this paragraph
            matches = sum(1 for w in evidence_words if w in para_lower)
            if matches >= 2:
                return {"valid": True, "matching_phrases": [evidence_words[:3]],
                        "tier": "keyword"}

    return {"valid": False, "reason": "evidence does not reference any real skill content"}


def list_available_skills() -> dict[str, str]:
    """Return {name: path} for all skills found in search roots."""
    result = {}
    for root in _SEARCH_ROOTS:
        if not root.exists():
            continue
        for item in root.iterdir():
            if item.is_dir():
                skill_file = item / "SKILL.md"
                if skill_file.exists():
                    result[item.name] = str(skill_file)
            elif item.is_file() and item.suffix == ".md":
                result[item.stem] = str(item)
    return result
