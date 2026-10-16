import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    { command: "node tests/mock-tarka.mjs", url: "http://127.0.0.1:3101/health" },
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100",
      env: { TARKA_API_KEY: "test-only-key", TARKA_API_BASE_URL: "http://127.0.0.1:3101/v1" },
    },
  ],
});
