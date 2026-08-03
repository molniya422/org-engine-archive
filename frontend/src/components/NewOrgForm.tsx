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
 * 完整 org-engine 组织结构原型（org-config v2.0 纯角色注册表）：
 * 角色只承载身份（id/agentType/bound_skills/persona/permissions）；
 * 结构（部门拆分/通信/会议）全部移交 workflow 侧，org 不再含 manager_pipeline/contracts。
 */
const DEFAULT_ORG_TEMPLATE = {
  version: '2.0',
  org: {
    name: '',
    description: 'org-engine 组织（角色注册表 v2.0：身份/技能/权限，结构搭建见 workflow）',
    departments: [
      {
        name: 'Arch',
        description: 'Cross-cutting technical decisions, contract first-drafting, risk',
        required: true,
        roles: [
          { id: 'arch.architect', name: 'architect', agentType: 'general-purpose', bound_skills: ['design-patterns'], persona: { title: '架构师' }, permissions: { can_veto: true, can_escalate: true } },
          { id: 'arch.integrator', name: 'integrator', agentType: 'general-purpose', bound_skills: ['pathfinder'], persona: { title: '集成工程师' }, permissions: { can_escalate: true } },
        ],
      },
      {
        name: 'FE',
        description: 'UI / Client implementation',
        required: true,
        roles: [
          { id: 'fe.fe_page_builder', name: 'fe_page_builder', agentType: 'general-purpose', bound_skills: ['taste-skill'], persona: { title: '页面构建师' } },
          { id: 'fe.fe_ui_system', name: 'fe_ui_system', agentType: 'general-purpose', bound_skills: ['stitch-skill'], persona: { title: 'UI 系统工程师' } },
        ],
      },
      {
        name: 'BE',
        description: 'Services / data / business logic',
        required: true,
        roles: [
          { id: 'be.implementer', name: 'implementer', agentType: 'general-purpose', bound_skills: ['test-driven-development'], persona: { title: '实现工程师' } },
        ],
      },
      {
        name: 'QA',
        description: 'Cross-department quality gate, acceptance criteria',
        required: true,
        roles: [
          { id: 'qa.reviewer', name: 'reviewer', agentType: 'general-purpose', bound_skills: ['pr-review'], persona: { title: '评审员' }, permissions: { can_veto: true, can_escalate: true } },
          { id: 'qa.tester', name: 'tester', agentType: 'general-purpose', bound_skills: ['verification-before-completion'], persona: { title: '测试员' }, permissions: { can_escalate: true } },
        ],
      },
      {
        name: 'Docs',
        description: 'User / API / architecture doc authoring',
        required: true,
        roles: [
          { id: 'docs.docs_author', name: 'docs_author', agentType: 'general-purpose', bound_skills: ['elements-of-style:writing-clearly-and-concisely'], persona: { title: '文档作者' } },
        ],
      },
      {
        name: 'Sec',
        description: 'Security review, permission model, dependency audit',
        required: false,
        roles: [
          { id: 'sec.security_auditor', name: 'security_auditor', agentType: 'general-purpose', bound_skills: ['security-guardian'], persona: { title: '安全审计员' }, permissions: { can_veto: true, can_escalate: true } },
        ],
      },
      {
        name: 'Design',
        description: 'Design systems, visual consistency',
        required: false,
        roles: [
          { id: 'design.designer', name: 'designer', agentType: 'general-purpose', bound_skills: ['design-is'], persona: { title: '设计师' } },
        ],
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
