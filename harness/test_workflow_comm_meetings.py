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


# ---------------------------------------------------------------------------
# Task 2.4: mediate() explicit rules (message edges + channel ACL + fallback)
# ---------------------------------------------------------------------------

def _med_org():
    """Plain-dict org view as passed to _mediation_decision."""
    return {
        'a1': {'kind': 'executor', 'department': 'FE', 'parent': 'mfe'},
        'a2': {'kind': 'executor', 'department': 'FE', 'parent': 'mfe'},
        'mfe': {'kind': 'manager', 'department': 'FE', 'parent': None},
        'a3': {'kind': 'executor', 'department': 'BE', 'parent': 'mbe'},
        'mbe': {'kind': 'manager', 'department': 'BE', 'parent': None},
    }


def _reset_wf_state():
    from organization_orchestrator import set_workflow_message_edges, set_workflow_channels
    set_workflow_message_edges(set())
    set_workflow_channels({}, {})


def test_default_cross_dept_rejected():
    from organization_orchestrator import ChannelHandle, ChannelVerdict, _mediation_decision
    _reset_wf_state()
    handle = ChannelHandle('a1', 'FE', 'mfe')
    assert _mediation_decision(handle, 'a3', _med_org()) == ChannelVerdict.REJECT_CROSS_DEPT


def test_same_dept_default_allowed():
    from organization_orchestrator import ChannelHandle, ChannelVerdict, _mediation_decision
    _reset_wf_state()
    handle = ChannelHandle('a1', 'FE', 'mfe')
    assert _mediation_decision(handle, 'a2', _med_org()) == ChannelVerdict.ALLOW


def test_explicit_message_edge_allows_cross_dept():
    from organization_orchestrator import ChannelHandle, ChannelVerdict, _mediation_decision, set_workflow_message_edges
    _reset_wf_state()
    set_workflow_message_edges({('a1', 'a3')})
    handle = ChannelHandle('a1', 'FE', 'mfe')
    assert _mediation_decision(handle, 'a3', _med_org()) == ChannelVerdict.ALLOW
    _reset_wf_state()


def test_channel_acl_allows_member():
    from organization_orchestrator import ChannelHandle, ChannelVerdict, _mediation_decision, set_workflow_channels
    _reset_wf_state()
    # a1(FE) 与 a3(BE) 同挂频道 api；a3 在读授权内 → 跨部门经频道放行
    set_workflow_channels({'api': {'read': ['a3'], 'write': []}}, {'a1': 'api', 'a3': 'api'})
    handle = ChannelHandle('a1', 'FE', 'mfe')
    assert _mediation_decision(handle, 'a3', _med_org()) == ChannelVerdict.ALLOW
    _reset_wf_state()


def test_configure_workflow_wires_edges_and_channels():
    from organization_orchestrator import OrganizationOrchestrator
    from organization_orchestrator import ChannelHandle, ChannelVerdict, _mediation_decision
    _reset_wf_state()
    wf = {
        'message_edges': [('n1', 'n3')],
        'channels': {'api': {'acl': {'read': ['n3'], 'write': []}}},
        'flow_edges': [{'source': 'n1', 'target': 'n2'}, {'source': 'n2', 'target': 'n3'}],
        'nodes': [
            {'id': 'n1', 'type': 'agent', 'role_ref': 'a'},
            {'id': 'n2', 'type': 'channel', 'channel': {'key': 'api'}},
            {'id': 'n3', 'type': 'agent', 'role_ref': 'b'},
        ],
        'meetings': [{'type': 'ministerial'}],
    }
    with tempfile.TemporaryDirectory() as d:
        orch = OrganizationOrchestrator(states_dir=Path(d), session_id='t')
        orch.configure_workflow(wf)
        assert orch._meetings == [{'type': 'ministerial'}]
        # n2 是 channel 节点，n1/n3 经 flow 边归属 api 频道
        from organization_orchestrator import _WF_NODE_CHANNEL
        assert _WF_NODE_CHANNEL.get('n1') == 'api'
        assert _WF_NODE_CHANNEL.get('n3') == 'api'
    _reset_wf_state()


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
