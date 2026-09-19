import pytest
import tempfile
from pathlib import Path
from harness.org_config_loader import load_org_config

VALID_YAML = """\
version: "1.0"
org:
  name: test-org
  departments:
    - name: Arch
      roles:
        - name: tech_lead
          agentType: general-purpose
          bound_skill: pathfinder
  contracts:
    - key: api
      owner_dept: Arch
      version: 1
      schema: {}
      dependents: [Arch, FE]
budget:
  max_depth: 3
  max_cycles_per_layer: 3
  max_executors_per_department: 6
"""

def test_load_valid_config():
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
        f.write(VALID_YAML)
        tmp = f.name
    try:
        config = load_org_config(tmp)
        assert config['org_name'] == 'test-org'
        assert len(config['departments']) == 1
        assert config['departments'][0]['name'] == 'Arch'
        assert config['departments'][0]['roles'][0]['name'] == 'tech_lead'
        assert len(config['contracts']) == 1
        assert config['budget']['max_depth'] == 3
    finally:
        Path(tmp).unlink()

def test_load_nonexistent_file():
    with pytest.raises(FileNotFoundError):
        load_org_config('/nonexistent/path.yaml')

def test_load_empty_departments():
    yaml_content = """\
version: "1.0"
org:
  name: test
  departments: []
budget:
  max_depth: 3
  max_cycles_per_layer: 3
  max_executors_per_department: 6
"""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
        f.write(yaml_content)
        tmp = f.name
    try:
        config = load_org_config(tmp)
        assert len(config['departments']) == 0
    finally:
        Path(tmp).unlink()
