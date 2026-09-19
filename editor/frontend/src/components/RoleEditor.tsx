import { useState, useEffect } from 'react';
import { t } from '@/i18n';
import { useSkillsStore } from '@/stores/skills-store';
import { BindingCheckPanel } from './binding/BindingCheckPanel';

/** org-config v2 角色（纯角色注册表：身份/技能/权限）。bound_skill 为 v1 残留，编辑时规范化。 */
interface Role {
  id?: string;
  name: string;
  agentType: string;
  bound_skills?: string[];
  bound_skill?: string; // v1 单值，规范化时并入 bound_skills 并丢弃
  persona?: { title?: string; backstory?: string; output_format?: string };
  permissions?: { can_veto?: boolean; can_escalate?: boolean };
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
    if (!role) { setLocalRole(null); return; }
    // 规范化 v1 残留：解构丢弃 bound_skill 单值 → bound_skills 数组
    const { bound_skill, ...rest } = role;
    const normalized: Role = {
      ...rest,
      bound_skills: role.bound_skills ?? (bound_skill ? [bound_skill] : []),
      permissions: role.permissions ?? { can_veto: false, can_escalate: false },
    };
    setLocalRole(normalized);
  }, [selectedRole, departments]);

  if (!selectedRole || !localRole) {
    return (
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="text-lg font-semibold">{t('Role Editor')}</h3>
        <p className="text-sm text-muted-foreground">{t('Select a role from the tree to edit its properties.')}</p>
      </div>
    );
  }

  const handleChange = (field: string, value: string | string[]) => {
    const updated = { ...localRole, [field]: value };
    setLocalRole(updated);
    onUpdate(updated);
  };
  const handleNestedChange = (objKey: string, field: string, value: unknown) => {
    const updated = { ...localRole, [objKey]: { ...(localRole as any)[objKey], [field]: value } };
    setLocalRole(updated);
    onUpdate(updated);
  };

  // 唯一 SKILL 名（排除 agentType 池同名项）
  const skillOptions = Array.from(new Set(skills.filter(s => s.source === 'skill').map(s => s.name))).sort();
  const boundSkills = localRole.bound_skills ?? [];

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <h3 className="text-lg font-semibold">{t('Edit Role')}</h3>

      <div className="space-y-1">
        <label className="text-sm font-medium">{t('Role ID')}</label>
        <input
          className="w-full border rounded px-3 py-1.5 text-sm"
          value={localRole.id ?? ''}
          onChange={e => handleChange('id', e.target.value)}
          placeholder="dept.role（如 arch.architect）"
        />
        <p className="text-xs text-muted-foreground">{t('Global unique ID — the anchor that workflows reference via role_ref.')}</p>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">{t('Name')}</label>
        <input
          className="w-full border rounded px-3 py-1.5 text-sm"
          value={localRole.name}
          onChange={e => handleChange('name', e.target.value)}
        />
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
        <label className="text-sm font-medium">{t('Bound Skills')}</label>
        <div className="flex flex-wrap gap-1.5">
          {boundSkills.map(s => (
            <span key={s} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs">
              {s}
              <button
                type="button"
                className="text-slate-400 hover:text-red-500"
                onClick={() => handleChange('bound_skills', boundSkills.filter(x => x !== s))}
              >×</button>
            </span>
          ))}
        </div>
        <select
          className="w-full border rounded px-3 py-1.5 text-sm"
          value=""
          onChange={e => {
            const v = e.target.value;
            if (v && !boundSkills.includes(v)) handleChange('bound_skills', [...boundSkills, v]);
          }}
        >
          <option value="">+ {t('Add skill')}</option>
          {skillOptions.filter(s => !boundSkills.includes(s)).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">{t('Persona Title')}</label>
        <input
          className="w-full border rounded px-3 py-1.5 text-sm"
          value={localRole.persona?.title ?? ''}
          onChange={e => handleNestedChange('persona', 'title', e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">{t('Backstory')}</label>
        <textarea
          className="w-full border rounded px-3 py-1.5 text-sm"
          value={localRole.persona?.backstory ?? ''}
          onChange={e => handleNestedChange('persona', 'backstory', e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">{t('Permissions')}</label>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={!!localRole.permissions?.can_veto}
              onChange={e => handleNestedChange('permissions', 'can_veto', e.target.checked)}
            />
            {t('Can Veto')}
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={!!localRole.permissions?.can_escalate}
              onChange={e => handleNestedChange('permissions', 'can_escalate', e.target.checked)}
            />
            {t('Can Escalate')}
          </label>
        </div>
      </div>

      <BindingCheckPanel />
    </div>
  );
}
