import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { t } from '../i18n';
import styles from './HomeView.module.css';
export function HomeView() {
    const navigate = useNavigate();
    const [orgs, setOrgs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeRun, setActiveRun] = useState(null);
    useEffect(() => {
        loadOrgs();
        checkActiveRun();
        const interval = setInterval(checkActiveRun, 5000);
        return () => clearInterval(interval);
    }, []);
    async function loadOrgs() {
        try {
            const list = await api.listOrgs();
            setOrgs(list);
        }
        catch { /* ignore */ }
        setLoading(false);
    }
    async function checkActiveRun() {
        try {
            const run = await api.getActiveRun();
            setActiveRun(run);
        }
        catch { /* ignore */ }
    }
    return (_jsxs("div", { className: styles.homeContainer, children: [_jsxs("div", { className: styles.header, children: [_jsx("div", { className: styles.headerLeft, children: _jsxs("div", { children: [_jsx("h1", { className: styles.headerTitle, children: t('home.title') }), _jsx("p", { className: styles.headerSubtitle, children: t('home.subtitle') })] }) }), _jsx("div", { className: styles.toolbar, children: _jsxs("button", { className: styles.createBtn, onClick: () => navigate('/studio/new'), children: ["+ ", t('home.createOrg')] }) })] }), activeRun?.active && (_jsxs("div", { className: styles.runBanner, children: [_jsx("div", { className: styles.runDot }), _jsxs("div", { className: styles.runInfo, children: [_jsx("div", { className: styles.runTitle, children: activeRun.task }), _jsx("div", { className: styles.runOrg, children: activeRun.orgId })] }), _jsx("button", { className: styles.viewRunBtn, onClick: () => navigate(`/run/${activeRun.runId}`), children: t('run.viewDetails') })] })), loading && (_jsx("div", { className: styles.emptyState, children: _jsx("p", { children: t('common.loading') }) })), !loading && orgs.length === 0 && (_jsxs("div", { className: styles.emptyState, children: [_jsx("div", { className: styles.emptyIcon, children: "\uD83C\uDFE2" }), _jsx("h2", { className: styles.emptyTitle, children: t('home.emptyTitle') }), _jsx("p", { className: styles.emptyDesc, children: t('home.emptyDesc') }), _jsxs("button", { className: styles.createBtn, onClick: () => navigate('/studio/new'), children: ["+ ", t('home.createOrg')] })] })), orgs.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: styles.orgGrid, children: orgs.map((org) => (_jsxs("div", { className: styles.orgCard, onClick: () => navigate(`/studio/${org.id}`), children: [_jsx("h3", { className: styles.orgName, children: org.name }), _jsxs("p", { className: styles.orgMeta, children: [org.deptCount, " departments \u00B7 ", org.roleCount, " roles"] }), _jsxs("div", { className: styles.orgBadges, children: [_jsxs("span", { className: styles.badge, children: ["\uD83D\uDCC1 ", org.deptCount, " depts"] }), _jsxs("span", { className: styles.badge, children: ["\uD83D\uDC64 ", org.roleCount, " roles"] })] })] }, org.id))) }), _jsxs("div", { className: styles.quickActions, children: [_jsxs("div", { className: styles.actionCard, onClick: () => navigate('/studio/new'), children: [_jsx("div", { className: styles.actionIcon, children: "\u2795" }), _jsx("p", { className: styles.actionLabel, children: t('home.createOrg') }), _jsx("p", { className: styles.actionDesc, children: t('home.createOrgDesc') })] }), _jsxs("div", { className: styles.actionCard, onClick: () => navigate('/skills'), children: [_jsx("div", { className: styles.actionIcon, children: "\uD83D\uDD27" }), _jsx("p", { className: styles.actionLabel, children: t('nav.skills') }), _jsx("p", { className: styles.actionDesc, children: t('home.skillsDesc') })] }), _jsxs("div", { className: styles.actionCard, onClick: async () => {
                                    if (orgs.length > 0) {
                                        try {
                                            const yaml = await api.exportOrg(orgs[0].id, 'yaml');
                                            await navigator.clipboard.writeText(yaml);
                                            alert(t('export.copied'));
                                        }
                                        catch { /* ignore */ }
                                    }
                                }, children: [_jsx("div", { className: styles.actionIcon, children: "\uD83D\uDCCB" }), _jsx("p", { className: styles.actionLabel, children: t('export.copy') }), _jsx("p", { className: styles.actionDesc, children: t('home.exportDesc') })] })] })] }))] }));
}
