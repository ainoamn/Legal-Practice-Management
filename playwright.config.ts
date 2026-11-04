import { defineConfig } from "@playwright/test";
import { config } from "dotenv";
config({ path: ".env.test", override: true, quiet: true });
if (process.env.LEGAL_TEST_ENV !== "1" || process.env.NODE_ENV === "production")
  throw new Error(
    "Playwright requires an isolated test database. Run npm run test:setup.",
  );
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45000,
  workers: 1,
  use: { baseURL: "http://localhost:4310", trace: "retain-on-failure" },
  webServer: [
    {
      command: "npm run start -w @legal/api",
      url: "http://127.0.0.1:4311/api/v1/health",
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: "npm run start -w @legal/web",
      url: "http://localhost:4310",
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
