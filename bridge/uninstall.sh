#!/usr/bin/env bash
# P9.3 — bridge uninstall：先备份，再移除 bridge 注入的文件。
#
# 原则：
# - 备份永远先于删除（uninstall-backup-<ts>.tar.gz 留在 archive/）。
# - 用户数据（memory/、projects/、settings.json、archive/）一律保留——
#   卸载软件不等于删除个人状态；重装后可恢复。
set -euo pipefail

TARGET="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

if [ ! -d "$TARGET/harness" ] && [ ! -d "$TARGET/training-loop" ]; then
    echo "Nothing to uninstall at $TARGET (no harness/ or training-loop/)."
    exit 0
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$TARGET/archive"
if tar -czf "$TARGET/archive/uninstall-backup-$STAMP.tar.gz" -C "$TARGET" harness training-loop lean-hooks.toml 2>/dev/null; then
    echo "Backed up to: $TARGET/archive/uninstall-backup-$STAMP.tar.gz"
else
    echo "ERROR: backup failed; refusing to delete anything." >&2
    exit 1
fi

# Remove only files the bridge installed. User data dirs stay.
rm -rf "$TARGET/harness" "$TARGET/training-loop"
echo "Removed: harness/ training-loop/"
echo "Kept:    memory/ projects/ settings.json archive/ (user data)"
echo "=== Uninstall complete ==="
