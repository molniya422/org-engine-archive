import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrgStore } from '@/stores/org-store';
import { api } from '@/api/client';
import { t } from '@/i18n';
import styles from './NewOrgForm.module.css';
function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        || 'org';
}
/** Clean org name to match schema pattern: ^[a-zA-Z0-9_-]{1,64}$ */
function sanitizeOrgName(raw) {
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
    const [error, setError] = useState(null);
    const handleCreate = async () => {
        const trimmed = name.trim();
        if (!trimmed)
            return;
        const safeName = sanitizeOrgName(trimmed);
        if (!safeName) {
            setError('组织名称只允许字母、数字、空格、下划线和连字符');
            return;
        }
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
        }
        catch (e) {
            setError(e?.message ?? String(e));
            setCreating(false);
        }
    };
    return (_jsxs("div", { className: styles.container, children: [_jsx("h2", { className: styles.title, children: t('Create Organization') }), error && _jsx("div", { className: styles.error, children: error }), _jsxs("div", { className: styles.field, children: [_jsx("label", { className: styles.label, children: t('Organization Name') }), _jsx("input", { className: styles.input, value: name, onChange: e => setName(e.target.value), placeholder: "\u4F8B\u5982\uFF1A\u6211\u7684\u56E2\u961F", disabled: creating, autoFocus: true, onKeyDown: e => { if (e.key === 'Enter')
                            handleCreate(); } })] }), _jsxs("div", { className: styles.actions, children: [_jsx("button", { className: styles.createBtn, onClick: handleCreate, disabled: !name.trim() || creating, children: creating ? t('Creating...') : t('Create Organization') }), _jsx("button", { className: styles.cancelBtn, onClick: () => navigate('/'), disabled: creating, children: t('Cancel') })] }), _jsx("p", { className: styles.hint, children: "\u5C06\u4F7F\u7528\u9ED8\u8BA4\u6A21\u677F\u521B\u5EFA\u4E00\u4E2A\u65B0\u7EC4\u7EC7\uFF0C\u5305\u542B Arch\u3001FE\u3001BE\u3001QA \u56DB\u4E2A\u90E8\u95E8\u3002 \u521B\u5EFA\u540E\u53EF\u968F\u65F6\u5728\u7F16\u8F91\u5668\u4E2D\u8FDB\u884C\u8C03\u6574\u3002" })] }));
}
