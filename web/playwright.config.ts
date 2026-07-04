import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Assumes the local DB has been migrated + seeded first
 * (npm run db:migrate && npm run db:seed). The web dev server is started
 * automatically; the Python engine is optional for the sign-in smoke flow.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/signin",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
