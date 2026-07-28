# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for bundling orchestrator-adapter into a standalone .exe.

Run from the org-engine-editor project root:
    pyinstaller scripts/build-harness.spec
"""
import sys
from pathlib import Path

# Resolve paths: project root is where pyinstaller is called from
project_root = Path.cwd()
lean_hooks = project_root / '..' / 'lean-hooks'

a = Analysis(
    # Entry point
    [str(lean_hooks / 'harness' / 'orchestrator_adapter.py')],
    # Search paths for imports
    pathex=[str(lean_hooks)],
    binaries=[],
    datas=[],
    hiddenimports=['yaml'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='orchestrator-adapter',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # need stdin/stdout for JSON-RPC communication
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
