#!/usr/bin/env bash
# P9.3 — personal event guard（事件采集守门员）。
#
# Bridge 对个人助理只注入两种能力：启动（session_start）和用户明确确认的
# 事件采集（user_confirmed_event）。shell 历史、对话记录等**永远不允许**
# 自动转成个人事实——这条防线在这里强制：不合法的事件从 stdin 进来，
# 拒绝并以非零码退出，绝不返回"采集成功"。
#
# 输入（stdin，单行 JSON）：
#   {"type": "session_start" | "user_confirmed_event" | "shell_log" | ...,
#    "source": "...", "payload": {...}}
# 输出（stdout，仅当通过时）：
#   {"ok": true, "data_dir": "<ORG_ENGINE_HOME 或默认>"}
set -euo pipefail

JSON="$(cat)"

# 用 Python 做健壮的 JSON 解析。注意 Windows 上 python3 可能是 Store 空壳
# （静默失败、退出码 49），所以探测后必须验证 --version 真的能跑。
PY=""
for CANDIDATE in python3 python; do
    if command -v "$CANDIDATE" &>/dev/null && "$CANDIDATE" --version &>/dev/null; then
        PY="$CANDIDATE"
        break
    fi
done
if [ -z "$PY" ]; then
    echo '{"ok":false,"reason":"python unavailable; refusing to accept events"}' >&2
    exit 3
fi

VERDICT="$("$PY" - "$JSON" <<'EOF'
import json, sys
try:
    ev = json.loads(sys.argv[1])
except Exception:
    print("bad_json"); sys.exit(0)

# P9.3: 只允许这两种来源。shell/对话/transcript 一律拒绝——
# 不把全部 shell 或对话日志自动转成个人事实。
ALLOWED = {"session_start", "user_confirmed_event"}
DENIED = {"shell_log", "command_log", "conversation_log", "transcript", "auto_fact"}

t = str(ev.get("type", ""))
if t in DENIED:
    print("denied:" + t)
elif t in ALLOWED:
    # user_confirmed_event 必须真的有用户确认痕迹
    if t == "user_confirmed_event" and not ev.get("confirmed_by_user"):
        print("unconfirmed")
    else:
        print("allowed")
else:
    print("unknown_type:" + (t or "<empty>"))
EOF
)"

case "$VERDICT" in
    allowed)
        # 个人状态存放在用户选择的数据目录（P9.3 规则 2）。
        DATA_DIR="${ORG_ENGINE_HOME:-$HOME/.org-engine-editor}"
        printf '{"ok":true,"data_dir":"%s"}\n' "$DATA_DIR"
        exit 0
        ;;
    denied:*)
        echo "{\"ok\":false,\"reason\":\"拒绝自动采集：${VERDICT#denied:} 是被明令禁止的来源，不经用户确认不得成为个人事实\"}" >&2
        exit 2
        ;;
    unconfirmed)
        echo '{"ok":false,"reason":"user_confirmed_event 缺少 confirmed_by_user 标记"}' >&2
        exit 4
        ;;
    unknown_type:*|bad_json)
        echo "{\"ok\":false,\"reason\":\"无法识别的事件：$VERDICT\"}" >&2
        exit 5
        ;;
esac
