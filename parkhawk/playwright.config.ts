import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const testDatabase = join(
  mkdtempSync(join(tmpdir(), "parkhawk-browser-")),
  "test.sqlite",
);
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    actionTimeout: 10000,
    launchOptions: {
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run db:seed && npm run ${process.env.TEST_PRODUCTION === "1" ? "start" : "dev"} -- --port 3100`,
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    env: { DATA_BACKEND: "sqlite", SQLITE_PATH: testDatabase },
    stdout: "pipe",
    timeout: 60000,
  },
});
