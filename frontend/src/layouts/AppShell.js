import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Outlet, NavLink } from 'react-router-dom';
import { t } from '@/i18n';
import styles from './AppShell.module.css';
export function AppShell() {
    return (_jsxs("div", { className: styles.shell, children: [_jsxs("aside", { className: styles.sidebar, children: [_jsx("div", { className: styles.logo, children: "\u2699 OrgEngine" }), _jsxs("nav", { className: styles.nav, children: [_jsxs(NavLink, { to: "/", end: true, className: ({ isActive }) => isActive ? styles.active : '', children: ["\uD83C\uDFE0 ", t('nav.home')] }), _jsxs(NavLink, { to: "/skills", className: ({ isActive }) => isActive ? styles.active : '', children: ["\uD83D\uDD27 ", t('nav.skills')] })] }), _jsxs("div", { className: styles.sidebarFooter, children: [_jsx("button", { className: styles.settingsBtn, title: t('nav.settings'), children: "\u2699\uFE0F" }), _jsx("span", { className: styles.mcpBadge, title: "MCP available on stdio", children: "MCP" })] })] }), _jsxs("main", { className: styles.main, children: [_jsx("div", { className: styles.toolbar, children: _jsx("span", { className: styles.toolbarTitle, children: '组织引擎编辑器' }) }), _jsx("div", { className: styles.content, children: _jsx(Outlet, {}) })] })] }));
}
