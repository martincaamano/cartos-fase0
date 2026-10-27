// Acceptance tests (docs/tareas/tarea-14.md): the real app in a browser
// with Google faked. WebKit with an iPhone profile is the reference, as it
// is Safari's engine; Chromium also runs the style snapshots, which are
// only kept for it (see styles.spec.js).

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  outputDir: '../test-results',
  snapshotPathTemplate: '{testDir}/__snapshots__/{arg}-{projectName}{ext}',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'webkit', use: { ...devices['iPhone 15'] } },
    {
      name: 'chromium',
      use: { ...devices['iPhone 15'], browserName: 'chromium', defaultBrowserType: 'chromium' },
    },
  ],
  webServer: {
    command: `node acceptance/server.js`,
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) },
  },
});
