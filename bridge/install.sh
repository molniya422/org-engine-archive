#!/usr/bin/env bash
# lean-hooks installer — copies templates to [CC] config directory
set -euo pipefail

TARGET="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SOURCE="$(cd "$(dirname "$0")" && pwd)"

# The harness scripts and training-loop modules live in the engine tree, not in
# bridge/. Resolve the engine root explicitly and fail loudly when it is wrong —
# the previous version copied 0 files while still printing "Installation
# complete", which made a broken install look successful.
if [ -n "${BRIDGE_ENGINE_ROOT:-}" ]; then
  if [ ! -d "$BRIDGE_ENGINE_ROOT" ]; then
    echo "ERROR: BRIDGE_ENGINE_ROOT does not exist: $BRIDGE_ENGINE_ROOT" >&2
    exit 1
  fi
  ENGINE_ROOT="$(cd "$BRIDGE_ENGINE_ROOT" && pwd)"
else
  # Default: <repo>/engine, relative to this script at <repo>/bridge/install.sh
  CANDIDATE="$(cd "$SOURCE/.." && pwd)/engine"
  if [ -d "$CANDIDATE/harness" ]; then
    ENGINE_ROOT="$CANDIDATE"
  else
    echo "ERROR: cannot locate the engine root (expected $CANDIDATE/harness)." >&2
    echo "       Set BRIDGE_ENGINE_ROOT=/path/to/engine and re-run." >&2
    exit 1
  fi
fi

for required in "$ENGINE_ROOT/harness" "$ENGINE_ROOT/training-loop"; do
  if [ ! -d "$required" ]; then
    echo "ERROR: required engine directory not found: $required" >&2
    exit 1
  fi
done

echo "=== lean-hooks Installer ==="
echo "Target: $TARGET"
echo "Engine root: $ENGINE_ROOT"
echo ""

# P9.3 — 升级前备份：已存在的安装先打包进 archive/，升级不可恢复性为零。
# （首装目录为空时跳过；备份只含 bridge 注入的文件，不含用户数据目录。）
if [ -d "$TARGET/harness" ]; then
    STAMP="$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$TARGET/archive"
    if tar -czf "$TARGET/archive/backup-$STAMP.tar.gz" -C "$TARGET" harness training-loop 2>/dev/null; then
        echo "[0/6] Backed up previous installation: archive/backup-$STAMP.tar.gz"
    else
        echo "ERROR: failed to back up the existing installation; refusing to upgrade in place." >&2
        exit 1
    fi
fi

# Create directories
mkdir -p "$TARGET/harness"
mkdir -p "$TARGET/skill-feedback"
mkdir -p "$TARGET/multiagent-feedback"
mkdir -p "$TARGET/toolcall-feedback"
mkdir -p "$TARGET/rules"
mkdir -p "$TARGET/memory"
mkdir -p "$TARGET/projects"
mkdir -p "$TARGET/data"
mkdir -p "$TARGET/hooks"           # plugin directory
mkdir -p "$TARGET/archive"         # rotated data

# Copy harness scripts, counting what actually landed. On re-install cp
# overwrites in place, so the file delta is 0 — count distinct files present
# (idempotent re-install) plus a source-sample check to prove copies work.
echo "[1/5] Installing harness scripts..."
cp "$ENGINE_ROOT/harness/"*.sh "$TARGET/harness/"
cp "$ENGINE_ROOT/harness/"*.py "$TARGET/harness/"
chmod +x "$TARGET/harness/"*.sh 2>/dev/null || true
HARNESS_COPIED=$(find "$TARGET/harness" -type f | wc -l)
# Sanity: at least one installed file must match a source file by name.
SAMPLE_OK=0
for f in "$ENGINE_ROOT/harness/"*.py; do
  if [ -f "$TARGET/harness/$(basename "$f")" ]; then SAMPLE_OK=1; break; fi
done
echo "  harness scripts installed: $HARNESS_COPIED"

# Copy training-loop Python modules
echo "  Installing training-loop modules..."
mkdir -p "$TARGET/training-loop"
cp "$ENGINE_ROOT/training-loop/"*.py "$TARGET/training-loop/" 2>/dev/null || true
cp "$ENGINE_ROOT/training-loop/"*.json "$TARGET/training-loop/" 2>/dev/null || true
cp "$ENGINE_ROOT/training-loop/"*.md "$TARGET/training-loop/" 2>/dev/null || true
TRAINING_COUNT=$(find "$TARGET/training-loop" -type f | wc -l)
echo "  training-loop modules installed: $TRAINING_COUNT"

# A silent zero-copy is the exact failure this check exists for.
if [ "$HARNESS_COPIED" -eq 0 ] || [ "$SAMPLE_OK" -eq 0 ]; then
  echo "ERROR: harness scripts were not copied from $ENGINE_ROOT/harness." >&2
  echo "       Refusing to report a successful installation." >&2
  exit 1
fi

# Copy templates
echo "[2/5] Installing templates..."
for name in skill-feedback multiagent-feedback toolcall-feedback rules; do
  if [ -d "$SOURCE/templates/$name" ]; then
    cp "$SOURCE/templates/$name/"* "$TARGET/$name/" 2>/dev/null || true
  fi
done
if [ -d "$SOURCE/templates/memory" ]; then
  cp "$SOURCE/templates/memory/"* "$TARGET/memory/" 2>/dev/null || true
fi
if [ -d "$SOURCE/templates/training-loop" ]; then
  cp "$SOURCE/templates/training-loop/"* "$TARGET/training-loop/" 2>/dev/null || true
fi

# Copy lean-hooks.toml (don't overwrite existing)
if [ ! -f "$TARGET/lean-hooks.toml" ]; then
    cp "$SOURCE/lean-hooks.toml" "$TARGET/lean-hooks.toml"
    echo "  Created lean-hooks.toml from template"
else
    echo "  lean-hooks.toml already exists — merge manually"
fi

# Copy example plugins
if [ -d "$SOURCE/hooks" ]; then
    cp "$SOURCE/hooks/"*.sh "$TARGET/hooks/" 2>/dev/null || true
    echo "  Copied example plugins"
fi

# Copy settings template (don't overwrite existing)
echo "[3/5] Setting up config files..."
if [ ! -f "$TARGET/settings.json" ]; then
    cp "$SOURCE/settings.template.json" "$TARGET/settings.json"
    echo "  Created settings.json from template"
else
    echo "  settings.json already exists — merge hooks manually from settings.template.json"
fi

if [ ! -f "$TARGET/CLAUDE.md" ]; then
    cp "$SOURCE/CLAUDE.md.template" "$TARGET/CLAUDE.md"
    echo "  Created CLAUDE.md from template"
else
    echo "  CLAUDE.md already exists — merge rules manually from CLAUDE.md.template"
fi

# Post-install check
echo "[4/5] Verifying..."
PY=""
if command -v python3 &>/dev/null; then
    PY="python3"
elif command -v python &>/dev/null; then
    PY="python"
fi

if [ -n "$PY" ]; then
    echo "  Python found: $($PY --version 2>&1)"
else
    echo "  WARNING: Python not found. Set HARNESS_PYTHON=/path/to/python"
fi

# DB migration check
if [ -n "$PY" ] && [ -f "$TARGET/harness/db-migrate.py" ]; then
    echo "  Running db-migrate --dry-run..."
    "$PY" "$TARGET/harness/db-migrate.py" --dry-run 2>/dev/null || true
fi

echo ""
echo "[5/5] Summary"
echo "  harness scripts:     $HARNESS_COPIED"
echo "  training-loop files: $TRAINING_COUNT"
echo "  target directory:    $TARGET"
echo ""
echo "=== Installation complete ==="
echo "Next steps:"
echo "  1. Review $TARGET/settings.json — ensure hooks match your setup"
echo "  2. Set HARNESS_PYTHON if Python is in a non-standard location"
echo "  3. (Optional) Set SKILL_ATTENTION_MODEL_DIR for semantic skill matching"
echo "  4. Restart [CC]"
echo ""
echo "To disable hooks temporarily:"
echo "  export DISABLED_HOOKS=\"multiagent-detect\""
