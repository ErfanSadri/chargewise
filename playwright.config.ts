import process from "node:process";

import { defineConfig, devices } from "@playwright/test";

const apiOrigin = "http://127.0.0.1:3100";
const webOrigin = "http://127.0.0.1:4173";
const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  "postgresql://chargewise:chargewise@127.0.0.1:5433/chargewise_e2e";
const redisUrl = process.env.E2E_REDIS_URL ?? "redis://127.0.0.1:6379/15";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: webOrigin,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @chargewise/api dev",
      env: {
        API_PORT: "3100",
        DATABASE_URL: databaseUrl,
        NODE_ENV: "test",
        REDIS_URL: redisUrl,
        ROUTE_PROVIDER_MODE: "fixture",
        SESSION_SECRET: "chargewise_e2e_session_secret_at_least_32_characters",
        TRUST_PROXY_HOPS: "0",
        WEB_ORIGIN: webOrigin,
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${apiOrigin}/api/v1/health`,
    },
    {
      command: "pnpm --filter web dev --host 127.0.0.1 --port 4173",
      env: {
        API_PROXY_TARGET: apiOrigin,
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: webOrigin,
    },
  ],
});
