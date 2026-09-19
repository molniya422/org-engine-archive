import json
from pathlib import Path
import yaml
from learning import cli


ORG_YAML = """version: "2.0"
org:
  name: t
  departments:
    - name: QA
      roles: []
  contracts: []
"""


def test_propose_writes_proposals(tmp_path, monkeypatch):
    # 准备事件流 + org
    data = tmp_path / "data" / "learning"
    data.mkdir(parents=True)
    # 3 条独立事件行(前 1 条不足触发阈值,3 条才够 MIN_EVIDENCE)
    line = json.dumps({"ts": "2026-09-11T00:00:00+00:00", "run_id": "r",
                       "kind": "dispatch_miss", "payload": {}}) + "\n"
    (data / "events.jsonl").write_text(line * 3, encoding="utf-8")
    org_path = tmp_path / "org.yaml"
    org_path.write_text(ORG_YAML, encoding="utf-8")
    # 把 cli 的路径常量重定向到 tmp
    monkeypatch.setattr(cli, "DATA_DIR", data)
    monkeypatch.setattr(cli, "PROPOSALS_DIR", data / "proposals")
    args = type("A", (), {"org": str(org_path)})()
    cli.cmd_propose(args)
    files = list((data / "proposals").glob("*.json"))
    assert len(files) == 1
    p = json.loads(files[0].read_text(encoding="utf-8"))
    assert p["rule"] == "dispatch_review"
    assert p["status"] == "proposed"