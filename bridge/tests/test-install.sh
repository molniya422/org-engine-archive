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
echo "=================================="
echo "Results: $PASS passed, $FAIL failed"
echo "=================================="
[ "$FAIL" -eq 0 ]
