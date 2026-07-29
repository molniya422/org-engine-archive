import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useSkillsStore } from '@/stores/skills-store';
import { SchemaViewer } from '@/components/SchemaViewer';
import { t } from '@/i18n';
import styles from './SkillsView.module.css';
export function SkillsView() {
    const { skills, loading, error, fetchSkills, scanSkills } = useSkillsStore();
    const [tab, setTab] = useState('skills');
    const [extraPath, setExtraPath] = useState('');
    useEffect(() => {
        fetchSkills();
    }, [fetchSkills]);
    return (_jsxs("div", { className: styles.container, children: [_jsx("header", { className: styles.header, children: _jsx("h1", { className: styles.title, children: t('Skills & Schema') }) }), _jsxs("div", { className: styles.tabBar, children: [_jsxs("button", { className: `${styles.tab} ${tab === 'skills' ? styles.activeTab : ''}`, onClick: () => setTab('skills'), children: [t('Skills'), " (", skills.length, ")"] }), _jsx("button", { className: `${styles.tab} ${tab === 'schema' ? styles.activeTab : ''}`, onClick: () => setTab('schema'), children: t('Schema') })] }), tab === 'skills' ? (_jsxs("div", { className: styles.skillsPanel, children: [_jsxs("div", { className: styles.toolbar, children: [_jsx("input", { className: styles.pathInput, placeholder: t('Extra scan path (optional)'), value: extraPath, onChange: e => setExtraPath(e.target.value) }), _jsx("button", { className: styles.scanBtn, onClick: () => scanSkills(extraPath ? [extraPath] : undefined), children: loading ? t('Scanning...') : t('Rescan') })] }), error && _jsx("div", { className: styles.error, children: error }), loading ? (_jsx("p", { className: styles.loading, children: t('Scanning skills...') })) : skills.length === 0 ? (_jsx("p", { className: styles.empty, children: t('No skills found. Trigger a scan to discover available skills.') })) : (_jsx("div", { className: styles.list, children: skills.map((skill, i) => (_jsxs("div", { className: styles.card, children: [_jsxs("div", { className: styles.cardHeader, children: [_jsx("span", { className: styles.skillName, children: skill.name }), _jsx("span", { className: `${styles.source} ${skill.source === 'skill' ? styles.sourceSkill : styles.sourceType}`, children: skill.source })] }), _jsx("p", { className: styles.skillDesc, children: skill.description }), skill.path && _jsx("span", { className: styles.skillPath, children: skill.path })] }, i))) }))] })) : (_jsx(SchemaViewer, {}))] }));
}
