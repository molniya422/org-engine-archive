import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrgStore } from '@/stores/org-store';
import { api } from '@/api/client';
import { t } from '@/i18n';
import styles from './NewOrgForm.module.css';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'org';
}

/** Clean org name to match schema pattern: ^[a-zA-Z0-9_-]{1,64}$ */
function sanitizeOrgName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 64);
}

const DEFAULT_ORG_TEMPLATE = {
  version: '1.0',
  org: {
    name: '',
    description: '',
    departments: [
      {
        name: 'Arch',
        description: '架构设计与技术决策',
        required: true,
        roles: [
          { name: 'architect', agentType: 'general-purpose', bound_skill: 'design-patterns' },
          { name: 'integrator', agentType: 'general-purpose', bound_skill: 'pathfinder' },
        ],
      },
      {
        name: 'FE',
        description: '前端开发',
        required: true,
        roles: [
          { name: 'fe_dev', agentType: 'general-purpose', bound_skill: 'taste-skill' },
        ],
      },
      {
        name: 'BE',
        description: '后端开发',
        required: true,
        roles: [
          { name: 'implementer', agentType: 'general-purpose', bound_skill: 'test-driven-development' },
        ],
      },
      {
        name: 'QA',
        description: '质量保障',
        required: true,
        roles: [
          { name: 'reviewer', agentType: 'general-purpose', bound_skill: 'pr-review' },
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
    if (!safeName) { setError('组织名称只允许字母、数字、空格、下划线和连字符'); return; }
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
    <div className={styles.container}>
      <h2 className={styles.title}>{t('Create Organization')}</h2>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.field}>
        <label className={styles.label}>{t('Organization Name')}</label>
        <input
          className={styles.input}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="例如：我的团队"
          disabled={creating}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
        />
      </div>

      <div className={styles.actions}>
        <button className={styles.createBtn} onClick={handleCreate} disabled={!name.trim() || creating}>
          {creating ? t('Creating...') : t('Create Organization')}
        </button>
        <button className={styles.cancelBtn} onClick={() => navigate('/')} disabled={creating}>
          {t('Cancel')}
        </button>
      </div>

      <p className={styles.hint}>
        将使用默认模板创建一个新组织，包含 Arch、FE、BE、QA 四个部门。
        创建后可随时在编辑器中进行调整。
      </p>
    </div>
  );
}
