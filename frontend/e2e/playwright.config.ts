import { defineConfig } from '@playwright/test';

const BACKEND_PORT = 15172;
const FRONTEND_PORT = 15173;

const sharedOpts = { timeout: 15_000, reuseExistingServer: false };

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
      command: `cross-env VITE_PROXY_TARGET=http://localhost:${BACKEND_PORT} npx vite --port ${FRONTEND_PORT} --strictPort`,
      port: FRONTEND_PORT,
      ...sharedOpts,
    },
  ],
});
