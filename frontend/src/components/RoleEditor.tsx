import { useState, useEffect } from 'react';
import { t } from '@/i18n';
import { useSkillsStore } from '@/stores/skills-store';

interface Role {
  name: string;
  agentType: string;
  bound_skill: string;
  [key: string]: any;
}

interface Department {
  name: string;
  roles: Role[];
}

interface RoleEditorProps {
  selectedRole: { deptIdx: number; roleIdx: number } | null;
  departments: Department[];
  onUpdate: (role: Role) => void;
}

const BUILTIN_AGENT_TYPES = [
  'general-purpose',
  'Explore',
  'Plan',
  'code-reviewer',
  'statusline-setup',
  'sonnet',
  'opus',
  'haiku',
  'fable',
];

export function RoleEditor({ selectedRole, departments, onUpdate }: RoleEditorProps) {
  const [localRole, setLocalRole] = useState<Role | null>(null);
  const { skills, fetchSkills } = useSkillsStore();

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  useEffect(() => {
    if (selectedRole === null) { setLocalRole(null); return; }
    const role = departments[selectedRole.deptIdx]?.roles[selectedRole.roleIdx];
    setLocalRole(role ? { ...role } : null);
  }, [selectedRole, departments]);

  if (!selectedRole || !localRole) {
    return (
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="text-lg font-semibold">{t('Role Editor')}</h3>
        <p className="text-sm text-muted-foreground">{t('Select a role from the tree to edit its properties.')}</p>
      </div>
    );
  }

  const handleChange = (field: string, value: string) => {
    const updated = { ...localRole, [field]: value };
    setLocalRole(updated);
    onUpdate(updated);
  };

  // Unique SKILL names only — exclude agentType pool entries that share this list
  const skillOptions = Array.from(new Set(skills.filter(s => s.source === 'skill').map(s => s.name))).sort();
  if (localRole.bound_skill && !skillOptions.includes(localRole.bound_skill)) {
    skillOptions.unshift(localRole.bound_skill);
  }

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <h3 className="text-lg font-semibold">{t('Edit Role')}</h3>
      <div className="space-y-1">
        <label className="text-sm font-medium">{t('Name')}</label>
        <input
          className="w-full border rounded px-3 py-1.5 text-sm"
          value={localRole.name}
          onChange={e => handleChange('name', e.target.value)}
          list="role-name-suggestions"
        />
        <datalist id="role-name-suggestions">
          <option value="architect" />
          <option value="implementer" />
          <option value="reviewer" />
          <option value="integrator" />
          <option value="designer" />
          <option value="tester" />
          <option value="fe_dev" />
          <option value="be_dev" />
          <option value="security_auditor" />
          <option value="docs_author" />
        </datalist>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">{t('Agent Type')}</label>
        <select
          className="w-full border rounded px-3 py-1.5 text-sm"
          value={localRole.agentType}
          onChange={e => handleChange('agentType', e.target.value)}
        >
          {BUILTIN_AGENT_TYPES.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">{t('Bound Skill')}</label>
        <div className="flex gap-2">
          <select
            className="w-full border rounded px-3 py-1.5 text-sm"
            value={skillOptions.includes(localRole.bound_skill) ? localRole.bound_skill : '__custom__'}
            onChange={e => {
              if (e.target.value !== '__custom__') handleChange('bound_skill', e.target.value);
            }}
          >
            {skillOptions.map(skill => (
              <option key={skill} value={skill}>{skill}</option>
            ))}
            <option value="__custom__">— 自定义 —</option>
          </select>
          {!skillOptions.includes(localRole.bound_skill) && (
            <input
              className="flex-1 border rounded px-3 py-1.5 text-sm"
              value={localRole.bound_skill}
              onChange={e => handleChange('bound_skill', e.target.value)}
              placeholder="输入自定义技能名称"
            />
          )}
        </div>
      </div>
      {localRole.context_note !== undefined && (
        <div className="space-y-1">
          <label className="text-sm font-medium">{t('Context Note')}</label>
          <textarea className="w-full border rounded px-3 py-1.5 text-sm" value={localRole.context_note} onChange={e => handleChange('context_note', e.target.value)} />
        </div>
      )}
    </div>
  );
}
