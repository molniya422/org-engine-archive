import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { t } from '@/i18n';
import { useSkillsStore } from '@/stores/skills-store';
import styles from './RoleEditor.module.css';
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
export function RoleEditor({ selectedRole, departments, onUpdate }) {
    const [localRole, setLocalRole] = useState(null);
    const { skills, fetchSkills } = useSkillsStore();
    useEffect(() => {
        fetchSkills();
    }, [fetchSkills]);
    useEffect(() => {
        if (selectedRole === null) {
            setLocalRole(null);
            return;
        }
        const role = departments[selectedRole.deptIdx]?.roles[selectedRole.roleIdx];
        setLocalRole(role ? { ...role } : null);
    }, [selectedRole, departments]);
    if (!selectedRole || !localRole) {
        return (_jsxs("div", { className: styles.panel, children: [_jsx("h3", { className: styles.title, children: t('Role Editor') }), _jsx("p", { className: styles.hint, children: t('Select a role from the tree to edit its properties.') })] }));
    }
    const handleChange = (field, value) => {
        const updated = { ...localRole, [field]: value };
        setLocalRole(updated);
        onUpdate(updated);
    };
    // Unique skill names from scanned skills, plus current value if not in list
    const skillOptions = Array.from(new Set(skills.map(s => s.name))).sort();
    if (localRole.bound_skill && !skillOptions.includes(localRole.bound_skill)) {
        skillOptions.unshift(localRole.bound_skill);
    }
    return (_jsxs("div", { className: styles.panel, children: [_jsx("h3", { className: styles.title, children: t('Edit Role') }), _jsxs("div", { className: styles.field, children: [_jsx("label", { className: styles.label, children: t('Name') }), _jsx("input", { className: styles.input, value: localRole.name, onChange: e => handleChange('name', e.target.value), list: "role-name-suggestions" }), _jsxs("datalist", { id: "role-name-suggestions", children: [_jsx("option", { value: "architect" }), _jsx("option", { value: "implementer" }), _jsx("option", { value: "reviewer" }), _jsx("option", { value: "integrator" }), _jsx("option", { value: "designer" }), _jsx("option", { value: "tester" }), _jsx("option", { value: "fe_dev" }), _jsx("option", { value: "be_dev" }), _jsx("option", { value: "security_auditor" }), _jsx("option", { value: "docs_author" })] })] }), _jsxs("div", { className: styles.field, children: [_jsx("label", { className: styles.label, children: t('Agent Type') }), _jsx("select", { className: styles.select, value: localRole.agentType, onChange: e => handleChange('agentType', e.target.value), children: BUILTIN_AGENT_TYPES.map(type => (_jsx("option", { value: type, children: type }, type))) })] }), _jsxs("div", { className: styles.field, children: [_jsx("label", { className: styles.label, children: t('Bound Skill') }), _jsxs("div", { className: styles.comboRow, children: [_jsxs("select", { className: styles.select, value: skillOptions.includes(localRole.bound_skill) ? localRole.bound_skill : '__custom__', onChange: e => {
                                    if (e.target.value !== '__custom__')
                                        handleChange('bound_skill', e.target.value);
                                }, children: [skillOptions.map(skill => (_jsx("option", { value: skill, children: skill }, skill))), _jsx("option", { value: "__custom__", children: "\u2014 \u81EA\u5B9A\u4E49 \u2014" })] }), !skillOptions.includes(localRole.bound_skill) && (_jsx("input", { className: styles.comboInput, value: localRole.bound_skill, onChange: e => handleChange('bound_skill', e.target.value), placeholder: "\u8F93\u5165\u81EA\u5B9A\u4E49\u6280\u80FD\u540D\u79F0" }))] })] }), localRole.context_note !== undefined && (_jsxs("div", { className: styles.field, children: [_jsx("label", { className: styles.label, children: t('Context Note') }), _jsx("textarea", { className: styles.textarea, value: localRole.context_note, onChange: e => handleChange('context_note', e.target.value) })] }))] }));
}
