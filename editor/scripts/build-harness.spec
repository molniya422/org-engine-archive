# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for bundling orchestrator-adapter into a standalone .exe.

Run from the org-engine-editor project root:
    pyinstaller scripts/build-harness.spec
"""
import sys
from pathlib import Path

# Resolve paths: project root is where pyinstaller is called from.
# In the org-engine monorepo the Python engine lives in ../engine
# (was ../lean-hooks before the monorepo merge).
project_root = Path.cwd()
engine = project_root / '..' / 'engine'

a = Analysis(
    # Entry point
    [str(engine / 'harness' / 'orchestrator_adapter.py')],
    # Search paths for imports
    pathex=[str(engine)],
    binaries=[],
    datas=[
        (str(engine / 'harness' / 'role-registry-org.yaml'), 'harness'),
    ],
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
