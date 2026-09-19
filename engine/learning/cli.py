"""learning CLI — collect / propose 两个子命令。

用法:
  python -m learning.cli collect
  python -m learning.cli propose --org path/to/org.yaml
"""
import argparse
import json
from pathlib import Path

import yaml

from .collector import run_collection
from .report import build_report
from .rules import propose
from .schema import read_events

ENGINE_DIR = Path(__file__).resolve().parent.parent      # engine/
DATA_DIR = ENGINE_DIR / "data" / "learning"
FEEDBACK_MD = ENGINE_DIR / "training-loop" / "feedback.md"
RUN_LOG = ENGINE_DIR / "loop-engineering" / "run-log.jsonl"
PROPOSALS_DIR = DATA_DIR / "proposals"


def cmd_collect(args):
    n = run_collection(FEEDBACK_MD, RUN_LOG, DATA_DIR / "events.jsonl")
    events = read_events(DATA_DIR / "events.jsonl")
    report = build_report(events)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"collected": n, "total_events": len(events)}, ensure_ascii=False))


def cmd_propose(args):
    events = read_events(DATA_DIR / "events.jsonl")
    org = yaml.safe_load(Path(args.org).read_text(encoding="utf-8"))
    proposals = propose(events, org, org_ref=Path(args.org).stem)
    PROPOSALS_DIR.mkdir(parents=True, exist_ok=True)
    for p in proposals:
        (PROPOSALS_DIR / f"{p['id']}.json").write_text(
            json.dumps(p, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"proposals": len(proposals)}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(prog="learning")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("collect")
    p = sub.add_parser("propose")
    p.add_argument("--org", required=True)
    args = parser.parse_args()
    {"collect": cmd_collect, "propose": cmd_propose}[args.cmd](args)


if __name__ == "__main__":
    main()