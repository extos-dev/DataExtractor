import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { viewport: { width: 1280, height: 800 } },
  webServer: {
    command: 'python3 -m http.server 4173 --directory tests/e2e/fixtures',
    url: 'http://127.0.0.1:4173/table-page.html',
    reuseExistingServer: true,
    timeout: 30_000
  }
});
