import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { t } from '@/i18n';
import styles from './SchemaViewer.module.css';
// Inline simplified schema display extracted from the JSON Schema
// In production this would fetch the schema from the backend
const SCHEMA_SECTIONS = [
    {
        title: t('Version & Metadata'),
        fields: [
            { name: 'version', type: 'string', required: true, description: t('Schema version (currently "1.0")') },
            { name: 'org.name', type: 'string', required: true, description: t('Organization name') },
            { name: 'budget.max_concurrent_tasks', type: 'integer', required: false, description: t('Global concurrency limit') },
            { name: 'budget.max_cost', type: 'number', required: false, description: t('Maximum cost ceiling') },
        ],
    },
    {
        title: t('Departments'),
        fields: [
            { name: 'org.departments[].name', type: 'string', required: true, description: t('Department name (unique)') },
            { name: 'org.departments[].required', type: 'boolean', required: false, description: t('Must have at least one role') },
            { name: 'org.departments[].optional', type: 'boolean', required: false, description: t('Department can be empty') },
            { name: 'org.departments[].roles[]', type: 'object', required: true, description: t('Array of role definitions') },
        ],
    },
    {
        title: t('Roles'),
        fields: [
            { name: 'name', type: 'string', required: true, description: t('Role identifier (unique per dept)') },
            { name: 'agentType', type: 'string', required: true, description: t('Claude agent type to use') },
            { name: 'bound_skill', type: 'string', required: true, description: t('SKILL.md name the role executes') },
            { name: 'context_note', type: 'string', required: false, description: t('Additional context for the role') },
        ],
    },
    {
        title: t('Contracts & Manager Stages'),
        fields: [
            { name: 'contracts[].name', type: 'string', required: true, description: t('Contract name') },
            { name: 'contracts[].description', type: 'string', required: true, description: t('What this contract governs') },
            { name: 'manager_stages[].gateway', type: 'string', required: true, description: t('L1, L2, or L3') },
            { name: 'manager_stages[].policy', type: 'string', required: false, description: t('Approval policy at this gateway') },
        ],
    },
    {
        title: t('Agent Types & Skills Paths'),
        fields: [
            { name: 'skill_paths', type: 'string[]', required: false, description: t('Extra directories to scan for skills') },
            { name: 'agentType (built-in)', 'type': 'string', required: false, description: t('general-purpose, Explore, Plan, code-reviewer, statusline-setup') },
        ],
    },
];
export function SchemaViewer() {
    const [expanded, setExpanded] = useState({});
    const toggle = (title) => setExpanded(s => ({ ...s, [title]: !s[title] }));
    return (_jsxs("div", { className: styles.viewer, children: [_jsxs("p", { className: styles.hint, children: [t('The OrgConfig follows the JSON Schema at'), " ", _jsx("code", { children: "schema/org-config.schema.json" }), ".", t('Below is a readable summary of the key fields.')] }), SCHEMA_SECTIONS.map(section => (_jsxs("div", { className: styles.section, children: [_jsxs("button", { className: styles.sectionHeader, onClick: () => toggle(section.title), children: [_jsx("span", { className: styles.arrow, children: expanded[section.title] ? '▼' : '▶' }), _jsx("span", { className: styles.sectionTitle, children: section.title })] }), expanded[section.title] && (_jsx("div", { className: styles.fields, children: section.fields.map(field => (_jsxs("div", { className: styles.field, children: [_jsxs("div", { className: styles.fieldTop, children: [_jsx("code", { className: styles.fieldName, children: field.name }), _jsx("span", { className: styles.fieldType, children: field.type }), field.required && _jsx("span", { className: styles.required, children: t('required') })] }), _jsx("p", { className: styles.fieldDesc, children: field.description })] }, field.name))) }))] }, section.title)))] }));
}
