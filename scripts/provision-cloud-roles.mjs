import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const ownerUrl = readFileSync(new URL("../.local/owner.url", import.meta.url), "utf8").trim();
const owner = new pg.Client({ connectionString: ownerUrl });
await owner.connect();
const password = () => randomBytes(24).toString("hex");
const appPassword = password();
const platformPassword = password();
await owner.query(
  `ALTER ROLE legal_runtime WITH LOGIN PASSWORD '${appPassword}'`,
);
await owner.query(
  `ALTER ROLE legal_platform_runtime WITH LOGIN PASSWORD '${platformPassword}'`,
);
const host = new URL(ownerUrl);
const databaseUrl = (user, secret) => {
  const url = new URL(ownerUrl);
  url.username = user;
  url.password = secret;
  url.searchParams.set("sslmode", "require");
  return url.toString();
};
const lines = [
  `DATABASE_URL=${databaseUrl("legal_runtime", appPassword)}`,
  `PLATFORM_DATABASE_URL=${databaseUrl("legal_platform_runtime", platformPassword)}`,
  `DIRECT_DATABASE_URL=${ownerUrl}`,
  `MFA_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`,
];
writeFileSync(new URL("../.local/deploy.env", import.meta.url), `${lines.join("\n")}\n`);
const check = await owner.query(
  `SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname IN ('legal_runtime','legal_platform_runtime') ORDER BY 1`,
);
console.log(JSON.stringify({ host: host.hostname, roles: check.rows }));
await owner.end();
