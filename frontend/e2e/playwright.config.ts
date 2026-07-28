import { defineConfig } from '@playwright/test';

const BACKEND_PORT = 5172;
const FRONTEND_PORT = 5173;

const sharedOpts = { timeout: 15_000, reuseExistingServer: !process.env.CI };

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: '../e2e-report' }], ['list']],
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `cross-env PORT=${BACKEND_PORT} npx tsx ../backend-server/src/server.ts`,
      port: BACKEND_PORT,
      ...sharedOpts,
    },
    {
      command: `npx vite --port ${FRONTEND_PORT} --strictPort`,
      port: FRONTEND_PORT,
      ...sharedOpts,
    },
  ],
});
