"""Make `engine/` importable as the top-level `learning` package.

Plan tests use `from learning.schema import ...`; pytest from the monorepo
root does not add `engine/` to sys.path automatically.
"""
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent.parent.parent  # engine/
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))