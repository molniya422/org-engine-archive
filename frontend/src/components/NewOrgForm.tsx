import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrgStore } from '@/stores/org-store';
import { api } from '@/api/client';
import { t } from '@/i18n';

function slugify(name: string): string {
  const latin = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (latin) return latin;
  // CJK-only names have no ASCII slug — derive a stable id from the name
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return `org-${h.toString(36)}`;
}

/** Keep Unicode letters/digits so CJK org names pass; match schema ^[\p{L}\p{N}_-]{1,64}$ */
function sanitizeOrgName(raw: string): string {
  return raw.replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 64);
}

/**
 * 完整 org-engine 组织结构原型（对齐 examples/default-org.yaml）：
 * L1 审议 → L2 部门拆分/主管会议（manager_pipeline）→ L3 执行者（role + bound_skill）→ 汇集审计 → 三关口。
 */
const DEFAULT_ORG_TEMPLATE = {
  version: '1.0',
  org: {
    name: '',
    description: 'org-engine 组织（L1 审议 → L2 部门拆分 → L3 执行者 → 汇集审计 → 三关口）',
    departments: [
      {
        name: 'Arch',
        description: 'Cross-cutting technical decisions, contract first-drafting, risk',
        required: true,
        roles: [
          { name: 'architect', agentType: 'general-purpose', bound_skill: 'design-patterns', can_veto: true, can_escalate: true },
          { name: 'integrator', agentType: 'general-purpose', bound_skill: 'pathfinder', can_escalate: true },
        ],
        manager_pipeline: [
          { name: 'decompose', agentType: 'general-purpose', bound_skill: 'pathfinder' },
          { name: 'dispatch', agentType: 'general-purpose', bound_skill: 'dispatching-parallel-agents' },
          { name: 'collect', agentType: 'general-purpose', bound_skill: 'summarize' },
          { name: 'review', agentType: 'general-purpose', bound_skill: 'requesting-code-review' },
        ],
      },
      {
        name: 'FE',
        description: 'UI / Client implementation',
        required: true,
        roles: [
          { name: 'fe_page_builder', agentType: 'general-purpose', bound_skill: 'taste-skill' },
          { name: 'fe_ui_system', agentType: 'general-purpose', bound_skill: 'stitch-skill' },
        ],
      },
      {
        name: 'BE',
        description: 'Services / data / business logic',
        required: true,
        roles: [
          { name: 'implementer', agentType: 'general-purpose', bound_skill: 'test-driven-development' },
        ],
      },
      {
        name: 'QA',
        description: 'Cross-department quality gate, acceptance criteria',
        required: true,
        roles: [
          { name: 'reviewer', agentType: 'general-purpose', bound_skill: 'pr-review', can_veto: true, can_escalate: true },
          { name: 'tester', agentType: 'general-purpose', bound_skill: 'verification-before-completion', can_escalate: true },
        ],
      },
      {
        name: 'Docs',
        description: 'User / API / architecture doc authoring',
        required: true,
        roles: [
          { name: 'docs_author', agentType: 'general-purpose', bound_skill: 'elements-of-style:writing-clearly-and-concisely' },
        ],
      },
      {
        name: 'Sec',
        description: 'Security review, permission model, dependency audit',
        required: false,
        roles: [
          { name: 'security_auditor', agentType: 'general-purpose', bound_skill: 'security-guardian', can_veto: true, can_escalate: true },
        ],
      },
      {
        name: 'Design',
        description: 'Design systems, visual consistency',
        required: false,
        roles: [
          { name: 'designer', agentType: 'general-purpose', bound_skill: 'design-is' },
        ],
      },
    ],
    contracts: [
      {
        key: 'api-spec',
        owner_dept: 'Arch',
        version: 1,
        schema: { type: 'object', properties: {} },
        dependents: ['Arch', 'FE', 'BE', 'QA', 'Docs', 'Sec', 'Design'],
      },
    ],
  },
  budget: {
    max_depth: 3,
    max_cycles_per_layer: 3,
    max_executors_per_department: 6,
    max_parallel_agents: 8,
    gateway_timeout_minutes: 60,
  },
  skill_paths: [],
};

export function NewOrgForm() {
  const navigate = useNavigate();
  const { fetchOrgs } = useOrgStore();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const safeName = sanitizeOrgName(trimmed);
    if (!safeName) { setError('组织名称不能为空，且仅允许字母（含中文）、数字、下划线、连字符和空格'); return; }
    setCreating(true);
    setError(null);
    try {
      const id = slugify(safeName);
      const data = {
        ...DEFAULT_ORG_TEMPLATE,
        org: { ...DEFAULT_ORG_TEMPLATE.org, name: safeName },
      };
      await api.saveOrg(id, data);
      await fetchOrgs();
      navigate(`/studio/${id}`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setCreating(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto p-6 space-y-4">
      <h2 className="text-lg font-semibold">{t('Create Organization')}</h2>

      {error && <div className="bg-destructive/10 text-destructive text-sm p-2 rounded">{error}</div>}

      <div className="space-y-1">
        <label className="text-sm font-medium">{t('Organization Name')}</label>
        <input
          className="w-full border rounded px-3 py-1.5 text-sm"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="例如：我的团队"
          disabled={creating}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
        />
      </div>

      <div className="flex gap-2">
        <button className="px-4 py-1.5 bg-primary text-primary-foreground text-sm rounded hover:bg-primary/90 disabled:opacity-50" onClick={handleCreate} disabled={!name.trim() || creating}>
          {creating ? t('Creating...') : t('Create Organization')}
        </button>
        <button className="px-4 py-1.5 border text-sm rounded hover:bg-accent" onClick={() => navigate('/')} disabled={creating}>
          {t('Cancel')}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        将使用默认模板创建一个新组织，包含 Arch、FE、BE、QA、Docs、Sec、Design 七个部门
        （org-engine 组织原型：含经理管线与契约）。创建后可随时在编辑器中进行调整。
      </p>
    </div>
  );
}
