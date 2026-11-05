import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "artifacts/playwright-results",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "artifacts/playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4581",
    viewport: { width: 1400, height: 900 },
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "electron", testMatch: /electron\.spec\.ts$/ },
    { name: "mock", testMatch: /\.spec\.ts$/, testIgnore: /electron\.spec\.ts$/ },
  ],
  webServer: {
    command: "npm run build:mock && npm run preview -- --host 127.0.0.1 --port 4581",
    url: "http://127.0.0.1:4581",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
  },
});
