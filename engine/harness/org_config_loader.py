"""Translate OrgConfig YAML into OrganizationOrchestrator-compatible structures."""
import yaml
from pathlib import Path
from typing import Any, Dict, List, Optional


def load_org_config(config_path: str) -> Dict[str, Any]:
    """Load and basic-validate an OrgConfig YAML, return a dict for the orchestrator."""
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"OrgConfig not found: {config_path}")
    with open(path, 'r', encoding='utf-8') as f:
        raw = yaml.safe_load(f)

    # Translate to orchestrator's internal format
    return {
        'org_name': raw['org']['name'],
        'org_description': raw['org'].get('description', ''),
        'departments': [_translate_dept(d) for d in raw['org']['departments']],
        'contracts': [_translate_contracts(c) for c in raw['org'].get('contracts', [])],
        'budget': raw['budget'],
        'skill_paths': raw.get('skill_paths', []),
    }


def _translate_dept(dept: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'name': dept['name'],
        'description': dept.get('description', ''),
        'required': dept.get('required', False),
        'roles': dept['roles'],
        'manager_pipeline': dept.get('manager_pipeline', []),
    }


def _translate_contracts(contract: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'key': contract['key'],
        'owner_dept': contract['owner_dept'],
        'version': contract.get('version', 1),
        'schema': contract.get('schema', {}),
        'dependents': contract.get('dependents', []),
    }
