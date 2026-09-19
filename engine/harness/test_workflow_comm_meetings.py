"""Tests for workflow-config support in the org-engine harness: org v2 loader,
workflow loader, comm mediation, meeting types, and audit persistence.

Run:  python harness/test_workflow_comm_meetings.py
      # or pytest from the repo root
"""
from __future__ import annotations

import json
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


# ---------------------------------------------------------------------------
# Task 2.5: meeting types (dept_internal / ministerial / decision)
# ---------------------------------------------------------------------------

def _meeting_org(department='Arch'):
    """One manager + isolated orchestrator. Uses REGISTRY-legal roles because
    add_executor validates against self._roles (KeyError otherwise)."""
    from organization_orchestrator import OrganizationOrchestrator
    orch = OrganizationOrchestrator(
        states_dir=Path(tempfile.mkdtemp(prefix='meet-')), session_id='t')
    mgr = orch.add_manager('manager_decompose', department, parent=None, depth=2)
    return orch, mgr


def test_meeting_participants_dept_internal():
    orch, mgr = _meeting_org(department='FE')
    e1 = orch.add_executor('fe_page_builder', 'FE', mgr.node_id, depth=3)
    e2 = orch.add_executor('fe_ui_system', 'FE', mgr.node_id, depth=3)
    orch.add_executor('implementer', 'BE', mgr.node_id, depth=3)  # 他部门，不应出现
    parts = orch.meeting_participants('dept_internal', department='FE')
    assert set(parts) == {e1.node_id, e2.node_id}


def test_meeting_participants_ministerial():
    orch, mgr = _meeting_org()
    ex = orch.add_executor('implementer', 'BE', mgr.node_id, depth=3)
    parts = orch.meeting_participants('ministerial')
    assert mgr.node_id in parts        # 部门主管在列
    assert ex.node_id not in parts     # 执行者不在列


def test_meeting_participants_decision_includes_executors():
    orch, mgr = _meeting_org()
    ex = orch.add_executor('implementer', 'BE', mgr.node_id, depth=3)
    parts = orch.meeting_participants('decision')
    assert ex.node_id in parts
    # registry 当前无 can_veto → decision = 纯执行层；断言只锁 executor 语义
    assert any(orch.org[p].kind == 'executor' for p in parts)


def test_meeting_participants_explicit_overrides_type():
    orch, mgr = _meeting_org(department='Arch')
    ex = orch.add_executor('architect', 'Arch', mgr.node_id, depth=3)
    parts = orch.meeting_participants('dept_internal', department='BE', explicit=[ex.node_id])
    assert parts == [ex.node_id]


def test_run_meeting_type_param_accepted():
    orch, mgr = _meeting_org()
    orch.add_executor('implementer', 'BE', mgr.node_id, depth=3)
    decision = orch.run_meeting(
        {'reviewer': 'APPROVE', 'tester': 'PASS', 'architect': 'APPROVE'},
        cycle=1, meeting_type='ministerial',
    )
    # apply_veto_rules 的完整词汇表
    assert decision in ('accept', 'revise', 'escalate')
    # 会议事件写入审计日志（含 meeting_type / participants）
    assert any(e.get('event_type') == 'meeting' for e in orch.audit_log)


# ---------------------------------------------------------------------------
# Task 2.6: comm audit + meeting minutes persistence (JSONL)
# ---------------------------------------------------------------------------

def test_mediate_persists_comm_audit():
    """mediate() 把每条消息写 comm.jsonl（sender/recipient/channel/verdict）。"""
    from organization_orchestrator import OrganizationOrchestrator
    d = Path(tempfile.mkdtemp(prefix='comm-'))
    orch = OrganizationOrchestrator(states_dir=d, session_id='t')
    mgr = orch.add_manager('manager_decompose', 'FE', parent=None, depth=2)
    e1 = orch.add_executor('fe_page_builder', 'FE', mgr.node_id, depth=3)
    e2 = orch.add_executor('fe_ui_system', 'FE', mgr.node_id, depth=3)
    result = orch.mediate(orch.channel_handle(e1.node_id), e2.node_id)
    assert result['verdict'] == 'allow'          # 同部门默认放行
    lines = (d / 'comm.jsonl').read_text(encoding='utf-8').strip().split('\n')
    assert len(lines) >= 1
    rec = json.loads(lines[-1])
    assert rec['from'] == e1.node_id
    assert rec['to'] == e2.node_id
    assert rec['verdict'] == 'allow'
    assert rec['channel'] is None                # 无显式频道 → null


def test_run_meeting_persists_minutes():
    """run_meeting() 把纪要写 meetings.jsonl（type/cycle/participants/decision）。"""
    from organization_orchestrator import OrganizationOrchestrator
    d = Path(tempfile.mkdtemp(prefix='meet-'))
    orch = OrganizationOrchestrator(states_dir=d, session_id='t')
    mgr = orch.add_manager('manager_decompose', 'Arch', parent=None, depth=2)
    ex = orch.add_executor('implementer', 'BE', mgr.node_id, depth=3)
    decision = orch.run_meeting(
        {'reviewer': 'APPROVE', 'tester': 'PASS'}, cycle=1,
        meeting_type='dept_internal', department='BE',
    )
    lines = (d / 'meetings.jsonl').read_text(encoding='utf-8').strip().split('\n')
    assert len(lines) >= 1
    rec = json.loads(lines[-1])
    assert rec['type'] == 'dept_internal'
    assert rec['cycle'] == 1
    assert rec['decision'] in ('accept', 'revise', 'escalate')
    assert ex.node_id in rec['participants']     # 部门内会议参与者 = BE 执行者


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
