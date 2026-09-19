"""Translate workflow-config YAML into orchestrator-consumable structures.

Workflow-config v2.0 is the "structure layer" (how runs flow, who talks to
whom, when meetings happen). Org-config v2.0 is the "role registry" (who
exists). This loader extracts the runtime-relevant views from a workflow:

  - channels:       shared communication channels with read/write ACLs
  - message_edges:  explicit point-to-point message authorizations (flow edges
                    are the execution sequence and need no runtime mapping)
  - meetings:       dept_internal / ministerial / decision meeting specs
"""
from __future__ import annotations

import yaml
from pathlib import Path
from typing import Any, Dict, List, Tuple


def load_workflow_config(config_path: str) -> Dict[str, Any]:
    """Load a workflow-config YAML and return orchestrator-consumable views."""
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"WorkflowConfig not found: {config_path}")
    raw = yaml.safe_load(path.read_text(encoding='utf-8'))

    nodes = raw.get('nodes', [])
    channels: Dict[str, Any] = {}
    meetings: List[Dict[str, Any]] = []
    for n in nodes:
        ntype = n.get('type')
        if ntype == 'channel':
            key = n['channel']['key']
            channels[key] = {'acl': n['channel'].get('acl', {'read': [], 'write': []})}
        elif ntype == 'meeting':
            meetings.append({
                'id': n['id'],
                'type': n['meeting']['type'],
                'participants': n['meeting'].get('participants', {'from': 'managers'}),
                'channel': n['meeting'].get('channel'),
                'agenda': n['meeting'].get('agenda'),
                'output': n['meeting'].get('output', {'write_to': ['channel']}),
            })
        elif ntype == 'agent':
            if not n.get('role_ref'):
                raise ValueError(f"agent node {n['id']} missing role_ref")

    message_edges: List[Tuple[str, str]] = []
    flow_edges: List[Dict[str, Any]] = []
    for e in raw.get('edges', []):
        if e.get('kind') == 'message':
            message_edges.append((e['source'], e['target']))
        else:
            flow_edges.append(e)

    return {
        'name': raw['name'],
        'nodes': nodes,
        'message_edges': message_edges,
        'channels': channels,
        'meetings': meetings,
        'flow_edges': flow_edges,
    }
