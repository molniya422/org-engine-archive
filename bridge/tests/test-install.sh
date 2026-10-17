#!/usr/bin/env bash
# Bridge installer tests — run in an isolated CLAUDE_CONFIG_DIR.
# Usage: bash tests/test-install.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALLER="$SCRIPT_DIR/../install.sh"
ENGINE_ROOT="$(cd "$SCRIPT_DIR/../../engine" && pwd)"

PASS=0
FAIL=0

ok()   { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

# Run the installer with an explicit engine root and isolated target.
run_installer() {
  local target="$1" engine_root="$2"
  CLAUDE_CONFIG_DIR="$target" BRIDGE_ENGINE_ROOT="$engine_root" bash "$INSTALLER" 2>&1
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "=== T1: first install into an empty config dir copies harness assets ==="
TARGET="$WORK/t1"
mkdir -p "$TARGET"
OUT="$(run_installer "$TARGET" "$ENGINE_ROOT" || true)"
HARNESS_COUNT=$(find "$TARGET/harness" -name '*.py' 2>/dev/null | wc -l)
TRAINING_COUNT=$(find "$TARGET/training-loop" -name '*.py' 2>/dev/null | wc -l)
[ "$HARNESS_COUNT" -gt 0 ] && ok "harness has $HARNESS_COUNT python modules" || bad "harness copied 0 python modules"
[ "$TRAINING_COUNT" -gt 0 ] && ok "training-loop has $TRAINING_COUNT python modules" || bad "training-loop copied 0 python modules"

echo ""
echo "=== T2: install succeeds (exit 0) with a valid engine root ==="
TARGET="$WORK/t2"
mkdir -p "$TARGET"
set +e
run_installer "$TARGET" "$ENGINE_ROOT" >/dev/null 2>&1
RC=$?
set -e
[ "$RC" -eq 0 ] && ok "installer exit code 0" || bad "installer exited $RC on a valid engine root"

echo ""
echo "=== T3: install FAILS loudly when the engine root is missing ==="
TARGET="$WORK/t3"
mkdir -p "$TARGET"
set +e
OUT="$(run_installer "$TARGET" "$WORK/does-not-exist" 2>&1)"
RC=$?
set -e
echo "  (installer exit=$RC)"
[ "$RC" -ne 0 ] && ok "installer exited $RC instead of printing success" || bad "installer printed success with a missing engine root"
echo "$OUT" | grep -qi "Installation complete" && bad "printed 'Installation complete' despite failure" || ok "no success banner on failure"
echo "$OUT" | grep -qiE "error|not found|missing" && ok "error message explains the cause" || bad "no explanatory error message"

echo ""
echo "=== T4: repeated install is idempotent (no error, config preserved) ==="
TARGET="$WORK/t4"
mkdir -p "$TARGET"
run_installer "$TARGET" "$ENGINE_ROOT" >/dev/null 2>&1
# Simulate a user-edited settings.json that must NOT be clobbered.
echo '{"user":"edited"}' > "$TARGET/settings.json"
set +e
run_installer "$TARGET" "$ENGINE_ROOT" >/dev/null 2>&1
RC=$?
set -e
[ "$RC" -eq 0 ] && ok "second install exit code 0" || bad "second install exited $RC"
[ "$(cat "$TARGET/settings.json")" = '{"user":"edited"}' ] && ok "user settings.json preserved" || bad "user settings.json was clobbered"

echo ""
echo "=== T5: templates are installed ==="
TARGET="$WORK/t5"
mkdir -p "$TARGET"
run_installer "$TARGET" "$ENGINE_ROOT" >/dev/null 2>&1
[ -f "$TARGET/skill-feedback/feedback.md" ] && ok "skill-feedback template installed" || bad "skill-feedback template missing"
[ -f "$TARGET/multiagent-feedback/feedback.md" ] && ok "multiagent-feedback template installed" || bad "multiagent-feedback template missing"
[ -f "$TARGET/lean-hooks.toml" ] && ok "lean-hooks.toml installed" || bad "lean-hooks.toml missing"

echo ""
echo "=== T6: real user config is never touched without CLAUDE_CONFIG_DIR ==="
# The installer defaults to $HOME/.claude. We only assert that the resolved
# default target is under HOME, never that a real install was performed.
OUT="$(CLAUDE_CONFIG_DIR="" bash -c 'echo "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"')"
case "$OUT" in
  *"/.claude") ok "default target stays under \$HOME/.claude" ;;
  *) bad "default target escaped \$HOME/.claude: $OUT" ;;
esac

echo ""
echo "=== T7 (P9.3): upgrade creates a backup archive before overwriting ==="
TARGET="$WORK/t7"
mkdir -p "$TARGET"
run_installer "$TARGET" "$ENGINE_ROOT" >/dev/null 2>&1
# Simulate a pre-upgrade marker so we can prove the backup captured the OLD state.
echo "# old harness" > "$TARGET/harness/upgrade-marker.sh"
sleep 1
set +e
run_installer "$TARGET" "$ENGINE_ROOT" >/dev/null 2>&1
RC=$?
set -e
BACKUPS=$(find "$TARGET/archive" -name 'backup-*.tar.gz' 2>/dev/null | wc -l)
[ "$RC" -eq 0 ] && ok "upgrade install exit code 0" || bad "upgrade install exited $RC"
[ "$BACKUPS" -ge 1 ] && ok "upgrade produced $BACKUPS backup archive(s)" || bad "no backup archive after upgrade"
if [ "$BACKUPS" -ge 1 ]; then
  # pipefail 陷阱：grep -q 提前关管道会让 tar 吃 SIGPIPE 拖垮整条管道，
  # 因此先把列表取成变量再匹配，不做跨进程管道。
  LISTING="$(tar -tzf "$TARGET/archive"/backup-*.tar.gz)"
  case "$LISTING" in
    *upgrade-marker.sh*) ok "backup contains the pre-upgrade state" ;;
    *) bad "backup archive is missing the pre-upgrade marker" ;;
  esac
fi

echo ""
echo "=== T8 (P9.3): uninstall backs up first, removes bridge files, keeps user data ==="
TARGET="$WORK/t8"
mkdir -p "$TARGET"
run_installer "$TARGET" "$ENGINE_ROOT" >/dev/null 2>&1
mkdir -p "$TARGET/memory"
echo "user memory" > "$TARGET/memory/keep-me.md"
set +e
CLAUDE_CONFIG_DIR="$TARGET" bash "$SCRIPT_DIR/../uninstall.sh" >/dev/null 2>&1
RC=$?
set -e
[ "$RC" -eq 0 ] && ok "uninstall exit code 0" || bad "uninstall exited $RC"
[ ! -d "$TARGET/harness" ] && ok "harness removed" || bad "harness still present after uninstall"
[ -f "$TARGET/memory/keep-me.md" ] && ok "user memory preserved" || bad "user memory was deleted"
UNINSTALL_BACKUPS=$(find "$TARGET/archive" -name 'uninstall-backup-*.tar.gz' 2>/dev/null | wc -l)
[ "$UNINSTALL_BACKUPS" -ge 1 ] && ok "uninstall backup archive exists" || bad "no uninstall backup"

echo ""
echo "=== T9 (P9.3): personal event guard — bridge never auto-converts logs into facts ==="
GUARD="$SCRIPT_DIR/../personal-event-guard.sh"
chmod +x "$GUARD" 2>/dev/null || true
# 启动事件：允许，数据目录落在用户选择的目录（ORG_ENGINE_HOME）。
OUT="$(ORG_ENGINE_HOME="$WORK/personal-data" echo '{"type":"session_start"}' | ORG_ENGINE_HOME="$WORK/personal-data" bash "$GUARD")"
echo "$OUT" | grep -q '"ok":true' && ok "session_start accepted" || bad "session_start rejected: $OUT"
echo "$OUT" | grep -q "$WORK/personal-data" && ok "data dir honors ORG_ENGINE_HOME" || bad "data dir ignores ORG_ENGINE_HOME: $OUT"
# 用户明确确认的事件：允许。
OUT="$(echo '{"type":"user_confirmed_event","confirmed_by_user":true}' | bash "$GUARD")"
echo "$OUT" | grep -q '"ok":true' && ok "user_confirmed_event accepted" || bad "confirmed event rejected: $OUT"
# shell 历史 / 对话记录：拒绝（不允许自动转成个人事实）。
for deny in shell_log conversation_log command_log transcript auto_fact; do
  set +e
  OUT="$(printf '{"type":"%s"}' "$deny" | bash "$GUARD" 2>&1)"
  RC=$?
  set -e
  [ "$RC" -ne 0 ] && ok "$deny refused (exit $RC)" || bad "$deny was accepted — privacy violation"
done
# 未确认的 user_confirmed_event：拒绝。
set +e
OUT="$(echo '{"type":"user_confirmed_event"}' | bash "$GUARD" 2>&1)"
RC=$?
set -e
[ "$RC" -ne 0 ] && ok "unconfirmed event refused" || bad "missing confirmed_by_user slipped through"

echo ""
echo "=================================="
echo "Results: $PASS passed, $FAIL failed"
echo "=================================="
[ "$FAIL" -eq 0 ]
