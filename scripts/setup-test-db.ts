import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { parse } from "dotenv";
if (process.env.NODE_ENV === "production")
  throw new Error("Test setup is forbidden in production");
if (!existsSync(".env.test")) {
  const ownerUrl = new URL(process.env.DIRECT_DATABASE_URL ?? ""),
    appUrl = new URL(process.env.DATABASE_URL ?? ""),
    platformUrl = new URL(process.env.PLATFORM_DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(ownerUrl.hostname))
    throw new Error(
      "Automatic test setup is local-only. Configure an isolated test environment explicitly for remote CI.",
    );
  const name = ownerUrl.pathname.slice(1).replace(/_test$/, "") + "_test",
    owner = decodeURIComponent(ownerUrl.username);
  if (!/^[a-zA-Z0-9_]+$/.test(name) || !/^[a-zA-Z0-9_]+$/.test(owner))
    throw new Error("Unsupported local database identifier");
  const adminUrl = new URL(ownerUrl);
  adminUrl.pathname = "/postgres";
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname=$1",
      [name],
    );
    if (!existing.rowCount)
      await client.query(`CREATE DATABASE "${name}" OWNER "${owner}"`);
  } finally {
    await client.end();
  }
  for (const url of [ownerUrl, appUrl, platformUrl]) url.pathname = "/" + name;
  const redis = new URL(process.env.REDIS_URL ?? "");
  redis.pathname = "/1";
  const settings = {
    DATABASE_URL: appUrl.toString(),
    DIRECT_DATABASE_URL: ownerUrl.toString(),
    PLATFORM_DATABASE_URL: platformUrl.toString(),
    REDIS_URL: redis.toString(),
    WEB_ORIGIN: "http://localhost:4310",
    INTERNAL_API_URL: "http://127.0.0.1:4311",
    API_PORT: "4311",
    SESSION_HOURS: "12",
    MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    RESEND_API_KEY: "",
    EMAIL_FROM: "",
    NODE_ENV: "test",
    LEGAL_TEST_ENV: "1",
  };
  writeFileSync(
    ".env.test",
    Object.entries(settings)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
  );
}
const settings = parse(readFileSync(".env.test"));
if (settings.LEGAL_TEST_ENV !== "1")
  throw new Error("Missing test environment marker");
const result = spawnSync(
  process.execPath,
  [
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
    "--config",
    "packages/database/prisma.config.ts",
  ],
  { stdio: "inherit", env: { ...process.env, ...settings } },
);
if (result.status !== 0) process.exit(result.status ?? 1);
process.stdout.write(
  "Isolated test database is ready. Test credentials remain in ignored .env.test.\n",
);
