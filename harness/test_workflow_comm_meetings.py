"""Tests for workflow-config support in the org-engine harness: org v2 loader,
workflow loader, comm mediation, meeting types, and audit persistence.

Run:  python harness/test_workflow_comm_meetings.py
      # or pytest from the repo root
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))


# ---------------------------------------------------------------------------
# Task 2.1: org_config_loader supports v2 role registry
# ---------------------------------------------------------------------------

def test_load_v2_role_registry():
    import yaml
    from org_config_loader import load_org_config

    cfg = {
        'version': '2.0',
        'org': {
            'name': 't',
            'departments': [
                {'name': 'Arch', 'roles': [
                    {'id': 'arch.architect', 'name': 'architect',
                     'agentType': 'general-purpose',
                     'bound_skills': ['design-patterns'],
                     'permissions': {'can_veto': True}},
                ]},
            ],
        },
        'budget': {},
    }
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / 'org.yaml'
        p.write_text(yaml.safe_dump(cfg), encoding='utf-8')
        loaded = load_org_config(str(p))
        dept = loaded['departments'][0]
        role = dept['roles'][0]
        # v2: roles 原样透传，保留 id / bound_skills
        assert role['id'] == 'arch.architect'
        assert role['bound_skills'] == ['design-patterns']
        assert role['permissions']['can_veto'] is True
        # v2 缺省结构字段优雅回落
        assert dept['manager_pipeline'] == []
        assert loaded['contracts'] == []


def test_load_v1_legacy_still_works():
    """v1 配置（bound_skill 单值 + manager_pipeline）继续可加载，不回归。"""
    import yaml
    from org_config_loader import load_org_config

    cfg = {
        'version': '1.0',
        'org': {
            'name': 't',
            'departments': [
                {'name': 'Arch', 'roles': [
                    {'id': 'arch.architect', 'name': 'architect',
                     'agentType': 'x', 'bound_skill': 'design-patterns'},
                ], 'manager_pipeline': [
                    {'name': 'decompose', 'agentType': 'x', 'bound_skill': 'pathfinder'},
                ]},
            ],
        },
        'budget': {},
    }
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / 'org.yaml'
        p.write_text(yaml.safe_dump(cfg), encoding='utf-8')
        loaded = load_org_config(str(p))
        assert loaded['departments'][0]['manager_pipeline'][0]['name'] == 'decompose'


# ---------------------------------------------------------------------------
# Task 2.2: workflow_config_loader
# ---------------------------------------------------------------------------

def test_load_workflow_channels_and_meetings():
    import yaml
    from workflow_config_loader import load_workflow_config

    cfg = {
        'version': '2.0',
        'name': 'wf',
        'nodes': [
            {'id': 'n1', 'type': 'agent', 'role_ref': 'arch.architect'},
            {'id': 'n2', 'type': 'channel', 'channel': {
                'key': 'api',
                'acl': {'read': ['fe.*'], 'write': ['arch.architect']},
            }},
            {'id': 'n3', 'type': 'meeting', 'meeting': {
                'type': 'ministerial',
                'participants': {'from': 'managers'},
                'agenda': 'align API contract',
            }},
        ],
        'edges': [
            {'id': 'e1', 'source': 'n1', 'target': 'n2', 'kind': 'flow'},
            {'id': 'e2', 'source': 'n1', 'target': 'n3', 'kind': 'message'},
        ],
    }
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / 'wf.yaml'
        p.write_text(yaml.safe_dump(cfg), encoding='utf-8')
        wf = load_workflow_config(str(p))
        assert wf['channels']['api']['acl']['write'] == ['arch.architect']
        assert wf['message_edges'] == [('n1', 'n3')]
        assert len(wf['meetings']) == 1
        assert wf['meetings'][0]['type'] == 'ministerial'
        assert wf['meetings'][0]['participants']['from'] == 'managers'


def test_agent_without_role_ref_raises():
    import yaml
    from workflow_config_loader import load_workflow_config

    cfg = {
        'version': '2.0', 'name': 'wf',
        'nodes': [{'id': 'n1', 'type': 'agent'}],
        'edges': [],
    }
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / 'wf.yaml'
        p.write_text(yaml.safe_dump(cfg), encoding='utf-8')
        try:
            load_workflow_config(str(p))
            raise AssertionError('expected ValueError')
        except ValueError:
            pass  # expected


if __name__ == '__main__':
    import traceback
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith('test_') and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except Exception:
                failed += 1
                print(f"FAIL {name}")
                traceback.print_exc()
    print(f"{'ALL PASS' if failed == 0 else str(failed) + ' FAILED'}")
    sys.exit(1 if failed else 0)
