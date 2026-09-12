import { defineConfig, devices } from '@playwright/test'
const baseURL = 'http://127.0.0.1:4289'
export default defineConfig({
  testDir: './e2e', fullyParallel: true, forbidOnly: Boolean(process.env['CI']), retries: process.env['CI'] ? 2 : 0,
  ...(process.env['CI'] ? { workers: 1 } : {}), reporter: 'list',
  use: { baseURL, screenshot: 'only-on-failure', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4289', url: baseURL, reuseExistingServer: false, timeout: 120_000 },
})
