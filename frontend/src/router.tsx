import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { HomeView } from './views/HomeView';
import { StudioView } from './views/StudioView';
import { RunMonitorView } from './views/RunMonitorView';
import { SkillsView } from './views/SkillsView';
import { TemplateLibrary } from './components/templates/TemplateLibrary';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomeView /> },
      { path: 'studio/:orgId', element: <StudioView /> },
      { path: 'studio/:orgId/runs/:runId', element: <RunMonitorView /> },
      { path: 'skills', element: <SkillsView /> },
      { path: 'templates', element: <TemplateLibrary /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
