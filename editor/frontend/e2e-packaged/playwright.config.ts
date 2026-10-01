import { defineConfig } from '@playwright/test';

// Drives the REAL packaged exe (release/win-unpacked/Org Engine Editor.exe).
// No webServer — the Electron app starts its own bundled Fastify backend.
export default defineConfig({
  testDir: '.',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  reporter: [['list']],
  use: { trace: 'on-first-failure', screenshot: 'only-on-failure' },
});
