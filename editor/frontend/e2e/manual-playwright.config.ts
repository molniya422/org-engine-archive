import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [['list'], ['html', { outputFolder: '../manual-e2e-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:15173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: 'D:\\Chromium\\Application\\chrome.exe' },
  },
});
