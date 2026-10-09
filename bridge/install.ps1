# lean-hooks installer for Windows
param()

$ErrorActionPreference = "Stop"

$Target = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { "$env:USERPROFILE\.claude" }
$Source = Split-Path -Parent $MyInvocation.MyCommand.Path

# The harness scripts and training-loop modules live in the engine tree, not in
# bridge/. Resolve the engine root explicitly and fail loudly when it is wrong —
# the previous version copied 0 files while still printing "Installation
# complete", which made a broken install look successful.
$EngineRoot = if ($env:BRIDGE_ENGINE_ROOT) {
    $env:BRIDGE_ENGINE_ROOT
} else {
    Join-Path (Split-Path -Parent $Source) "engine"
}

if (-not (Test-Path $EngineRoot)) {
    Write-Error "ERROR: engine root not found: $EngineRoot. Set BRIDGE_ENGINE_ROOT=/path/to/engine and re-run."
    exit 1
}
foreach ($required in @("harness", "training-loop")) {
    if (-not (Test-Path (Join-Path $EngineRoot $required))) {
        Write-Error "ERROR: required engine directory not found: $(Join-Path $EngineRoot $required)"
        exit 1
    }
}

Write-Host "=== lean-hooks Installer (Windows) ==="
Write-Host "Target: $Target"
Write-Host "Engine root: $EngineRoot"

# Create directories
$dirs = @("harness", "training-loop", "skill-feedback", "multiagent-feedback", "toolcall-feedback", "rules", "memory", "projects", "data", "hooks", "archive")
foreach ($d in $dirs) {
    New-Item -ItemType Directory -Force -Path "$Target\$d" | Out-Null
}

# Copy harness scripts, counting what actually landed.
Write-Host "[1/4] Installing harness scripts..."
Copy-Item "$EngineRoot\harness\*.sh" "$Target\harness\" -Force
Copy-Item "$EngineRoot\harness\*.py" "$Target\harness\" -Force
$HarnessCopied = (Get-ChildItem "$Target\harness" -File).Count
# Sanity: at least one installed file must match a source file by name.
$SampleOk = $false
foreach ($f in (Get-ChildItem "$EngineRoot\harness" -Filter *.py)) {
    if (Test-Path "$Target\harness\$($f.Name)") { $SampleOk = $true; break }
}
Write-Host "  harness scripts installed: $HarnessCopied"

# Copy training-loop Python modules
Write-Host "  Installing training-loop modules..."
Copy-Item "$EngineRoot\training-loop\*.py" "$Target\training-loop\" -Force -ErrorAction SilentlyContinue
Copy-Item "$EngineRoot\training-loop\*.json" "$Target\training-loop\" -Force -ErrorAction SilentlyContinue
Copy-Item "$EngineRoot\training-loop\*.md" "$Target\training-loop\" -Force -ErrorAction SilentlyContinue
$TrainingCopied = (Get-ChildItem "$Target\training-loop" -File).Count
Write-Host "  training-loop modules installed: $TrainingCopied"

# A silent zero-copy is the exact failure this check exists for.
if ($HarnessCopied -eq 0 -or -not $SampleOk) {
    Write-Error "ERROR: harness scripts were not copied from $EngineRoot\harness. Refusing to report a successful installation."
    exit 1
}

# Copy templates
Write-Host "[2/4] Installing templates..."
foreach ($name in @("skill-feedback", "multiagent-feedback", "toolcall-feedback", "rules")) {
    if (Test-Path "$Source\templates\$name") {
        Copy-Item "$Source\templates\$name\*" "$Target\$name\" -Force -ErrorAction SilentlyContinue
    }
}
if (Test-Path "$Source\templates\memory") {
    Copy-Item "$Source\templates\memory\*" "$Target\memory\" -Force -ErrorAction SilentlyContinue
}
if (Test-Path "$Source\templates\training-loop") {
    Copy-Item "$Source\templates\training-loop\*" "$Target\training-loop\" -Force -ErrorAction SilentlyContinue
}

# Config files
Write-Host "[3/4] Setting up config..."
if (-not (Test-Path "$Target\lean-hooks.toml")) {
    Copy-Item "$Source\lean-hooks.toml" "$Target\lean-hooks.toml"
    Write-Host "  Created lean-hooks.toml from template"
} else {
    Write-Host "  lean-hooks.toml exists - merge manually"
}
if (-not (Test-Path "$Target\settings.json")) {
    Copy-Item "$Source\settings.template.json" "$Target\settings.json"
    Write-Host "  Created settings.json from template"
} else {
    Write-Host "  settings.json exists - merge hooks manually"
}
if (-not (Test-Path "$Target\CLAUDE.md")) {
    Copy-Item "$Source\CLAUDE.md.template" "$Target\CLAUDE.md"
    Write-Host "  Created CLAUDE.md from template"
} else {
    Write-Host "  CLAUDE.md exists - merge manually"
}

# Copy example plugins
if (Test-Path "$Source\hooks") {
    Copy-Item "$Source\hooks\*.sh" "$Target\hooks\" -Force -ErrorAction SilentlyContinue
    Write-Host "  Copied example plugins"
}

Write-Host "[4/4] Verifying..."
$Py = if (Get-Command python3 -ErrorAction SilentlyContinue) { "python3" } else { "python" }
try {
    $ver = & $Py --version 2>&1
    Write-Host "  Python found: $ver"
} catch {
    Write-Host "  WARNING: Python not found. Set HARNESS_PYTHON env var."
}

# DB migration check
if (Test-Path "$Target\harness\db-migrate.py") {
    Write-Host "  Running db-migrate --dry-run..."
    try { & $Py "$Target\harness\db-migrate.py" --dry-run 2>$null } catch {}
}

Write-Host ""
Write-Host "  harness scripts:     $HarnessCopied"
Write-Host "  training-loop files: $TrainingCopied"
Write-Host "  target directory:    $Target"
Write-Host ""
Write-Host "=== Installation complete ==="
Write-Host "Next steps:"
Write-Host "  1. Review $Target\settings.json — ensure hooks match your setup"
Write-Host "  2. Set HARNESS_PYTHON if Python is in a non-standard location"
Write-Host "  3. (Optional) Set SKILL_ATTENTION_MODEL_DIR for semantic skill matching"
Write-Host "  4. Restart [CC]"
