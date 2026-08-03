import { createHashRouter, Navigate } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { HomeView } from './views/HomeView';
import { StudioView } from './views/StudioView';
import { RunMonitorView } from './views/RunMonitorView';
import { SkillsView } from './views/SkillsView';
import { HealthView } from './views/HealthView';
import { PlaybookLibrary } from './components/playbook/PlaybookLibrary';
import { MeetingsView } from './views/MeetingsView';

/**
 * MUST use HashRouter for Electron packaged builds.
 * BrowserRouter / createBrowserRouter depend on History API path routing
 * and break under the file:// protocol (blank shell / dead nav for
 * /templates, /health, /studio/*). Hash routes work with loadFile().
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomeView /> },
      { path: 'studio/:orgId', element: <StudioView /> },
      { path: 'studio/:orgId/runs/:runId', element: <RunMonitorView /> },
      { path: 'skills', element: <SkillsView /> },
      { path: 'meetings', element: <MeetingsView /> },
      { path: 'health', element: <HealthView /> },
      { path: 'templates', element: <PlaybookLibrary /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
