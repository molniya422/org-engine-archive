"""Router node — ported two-phase scoring from multiagent-detect.sh"""
import os
import re

from orchestrator.config import get_thresholds
from orchestrator.state import SharedState

STRONG = ["parallel agents", "parallel agent", "同时处理", "多个 agent", "多个agent",
          "dispatch agents", "并行 agent", "并行agent", "parallel tasks", "parallel execution"]
MODERATE = ["fix.*and.*refactor", "implement.*and.*test", "review.*and.*merge",
            "review.*and.*write", "review.*and.*test", "write.*and.*test",
            "一边.*一边", "同时.*和.*", "一起.*和.*", "both.*and",
            "fix.*then.*add", "fix.*and.*implement", "add.*and.*test",
            "，并写", "，并测", "，且写", "，且测", "，并且",
            "实现.*并.*测试", "实现.*并.*写", "开发.*并.*",
            "添加.*并.*测试", "添加.*并.*验证", "review.*and.*"]
WEAK = ["能不能.*然后", "能不能.*再", "先.*然后.*再", "please.*then.*",
        "also.*need.*", "in addition", "additionally", "还有.*需要.*", "另外.*还要.*"]
GREETINGS = ["hello", "hi", "hey", "你好", "您好", "早上好", "晚上好", "在吗", "在嘛"]

FORCE_PATTERNS = [r"并行执行", r"拆分成子任务", r"拆分.*并行", r"同时.*多个任务",
                  r"分成.*agent", r"强制.*multiagent", r"force.*multiagent",
                  r"dispatch.*parallel", r"parallel.*agents?", r"多个.*并行"]

WEIGHTS = {
    "strong_multiagent": 3, "moderate_multiagent": 2, "weak_multiagent": 1,
    "structure_bonus": 1, "short_penalty": -3, "greeting_penalty": -2,
}


def phase1_score(text: str, text_lower: str) -> tuple[int, list[str]]:
    score = 0
    reasons = []

    # Short penalty — but skip if we already detected multi-task signal
    multi_signal = False
    for kw in MODERATE + STRONG:
        if re.search(kw, text_lower):
            multi_signal = True
            break

    if len(text) < 40 and not multi_signal:
        score += WEIGHTS["short_penalty"]
        reasons.append("short")
    elif len(text) > 200 and text.count("。") + text.count("，") + text.count(".") >= 3:
        score += WEIGHTS["structure_bonus"]
        reasons.append("structure")
    for g in GREETINGS:
        if text_lower.startswith(g):
            score += WEIGHTS["greeting_penalty"]
            reasons.append("greeting")
            break
    for kw in STRONG:
        if re.search(kw, text_lower):
            score += WEIGHTS["strong_multiagent"]
            reasons.append("strong_keyword")
            break
    for kw in MODERATE:
        if re.search(kw, text_lower):
            score += WEIGHTS["moderate_multiagent"]
            reasons.append("moderate_keyword")
            break
    for kw in WEAK:
        if re.search(kw, text_lower):
            score += WEIGHTS["weak_multiagent"]
            reasons.append("weak_keyword")
            break
    return score, reasons


def phase2_heuristic(text: str, text_lower: str, score: int,
                     reasons: list[str]) -> tuple[int, list[str]]:
    task_verbs = len(re.findall(
        r"\b(fix|refactor|implement|add|update|remove|move|rename|create|"
        r"generate|build|test|review|merge|deploy|optimize|convert|"
        r"migrate|restructure)\b", text_lower))
    file_refs = len(re.findall(
        r"\b[\w\-/]+\.(py|js|ts|jsx|tsx|rs|go|java|kt|swift|rb|php|cs|"
        r"cpp|c|h|hpp|yaml|yml|json|toml|md|sh|sql)\b", text_lower))
    if task_verbs >= 2:
        score += 1
        reasons.append("multi_verb")
    if file_refs >= 2:
        score += 1
        reasons.append("multi_file")
    if "strong_keyword" in reasons and task_verbs < 2 and file_refs < 2:
        score -= 1
        reasons.append("isolated_strong")
    return score, reasons


def is_force_trigger(text_lower: str) -> str | None:
    for pat in FORCE_PATTERNS:
        if re.search(pat, text_lower):
            return pat
    return None


def route_decision(state: SharedState) -> str:
    """Determines routing: 'single' or 'collaborative'"""
    msgs = state.get("messages", [])
    if not msgs:
        return "single"
    last = msgs[-1].get("content", "") if isinstance(msgs[-1], dict) else str(msgs[-1])
    text = last.strip()
    text_lower = text.lower()
    thresholds = get_thresholds()
    p1 = thresholds["PHASE1_TRIGGER_MIN"]
    p2 = thresholds["PHASE2_TRIGGER_MIN"]

    if is_force_trigger(text_lower):
        return "collaborative"

    score, reasons = phase1_score(text, text_lower)
    if 2 <= score < p1:
        score, reasons = phase2_heuristic(text, text_lower, score, reasons)

    # Multi-task signal: strong/moderate keyword matched OR multi-verb/file found
    has_multi_evidence = any(r in reasons for r in ("multi_verb", "multi_file"))
    has_multi_keyword = any(r in reasons for r in ("moderate_keyword", "strong_keyword"))

    # If multi-task signal exists, lower threshold from p1 to p2.
    # If strong keyword specifically, accept score as-is (>=1 strong + 0 = 3 → trigger).
    if has_multi_evidence:
        effective_threshold = p2
    elif has_multi_keyword:
        effective_threshold = score  # any strong/moderate keyword triggers
    else:
        effective_threshold = p1

    return "collaborative" if score >= effective_threshold else "single"


def router_node(state: SharedState) -> SharedState:
    decision = route_decision(state)
    state["routing_decision"] = decision
    return state
