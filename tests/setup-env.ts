import { config } from "dotenv";
config({ path: ".env.test", override: true, quiet: true });
export function requireTestDatabase() {
  if (
    process.env.LEGAL_TEST_ENV !== "1" ||
    process.env.NODE_ENV === "production"
  )
    throw new Error(
      "Tests require an isolated database: run npm run test:setup first. Never run test fixtures against production.",
    );
}
