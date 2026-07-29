import { jsx as _jsx } from "react/jsx-runtime";
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { HomeView } from './views/HomeView';
import { StudioView } from './views/StudioView';
import { RunMonitorView } from './views/RunMonitorView';
import { SkillsView } from './views/SkillsView';
export const router = createBrowserRouter([
    {
        path: '/',
        element: _jsx(AppShell, {}),
        children: [
            { index: true, element: _jsx(HomeView, {}) },
            { path: 'studio/:orgId', element: _jsx(StudioView, {}) },
            { path: 'studio/:orgId/runs/:runId', element: _jsx(RunMonitorView, {}) },
            { path: 'skills', element: _jsx(SkillsView, {}) },
            { path: '*', element: _jsx(Navigate, { to: "/", replace: true }) },
        ],
    },
]);
