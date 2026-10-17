import { createHashRouter, Navigate } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { HomeView } from './views/HomeView';
import { StudioView } from './views/StudioView';
import { RunMonitorView } from './views/RunMonitorView';
import { SkillsView } from './views/SkillsView';
import { HealthView } from './views/HealthView';
import { PlaybookLibrary } from './components/playbook/PlaybookLibrary';
import { MeetingsView } from './views/MeetingsView';
import { CommAuditView } from './views/CommAuditView';
import { ProductRegistryView } from './views/ProductRegistryView';
import { PersonalApp } from './views/PersonalApp';

/**
 * MUST use HashRouter for Electron packaged builds.
 * BrowserRouter / createBrowserRouter depend on History API path routing
 * and break under the file:// protocol (blank shell / dead nav for
 * /templates, /health, /studio/*). Hash routes work with loadFile().
 *
 * P8.4 — /personal/** 是默认（个人）模式的全部路由；组织/工作流/诊断等
 * 开发者路由保留在高级模式（由 AppShell 的模式开关控制入口可见性）。
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomeView /> },
      { path: 'personal', element: <PersonalApp /> },
      { path: 'personal/:tab', element: <PersonalApp /> },
      { path: 'personal/diagnostics/:taskId', element: <PersonalApp /> },
      { path: 'studio/:orgId', element: <StudioView /> },
      { path: 'studio/:orgId/runs/:runId', element: <RunMonitorView /> },
      { path: 'skills', element: <SkillsView /> },
      { path: 'meetings', element: <MeetingsView /> },
      { path: 'comm', element: <CommAuditView /> },
      { path: 'products', element: <ProductRegistryView /> },
      { path: 'health', element: <HealthView /> },
      { path: 'templates', element: <PlaybookLibrary /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
