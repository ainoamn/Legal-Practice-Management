import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parse } from "dotenv";
if (!existsSync(".env")) throw new Error("Copy .env.example to .env first.");
const source = readFileSync(".env", "utf8"),
  settings = parse(source);
if (settings.NODE_ENV === "production" || process.env.NODE_ENV === "production")
  throw new Error(
    "Use your production secret manager; this helper is local-only.",
  );
if (settings.MFA_ENCRYPTION_KEY) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(settings.MFA_ENCRYPTION_KEY))
    throw new Error("An existing MFA key is invalid. It was not replaced.");
  process.stdout.write("MFA key is already configured and was not changed.\n");
} else {
  const key = randomBytes(32).toString("base64");
  const line = `MFA_ENCRYPTION_KEY=${key}`;
  const updated = /^MFA_ENCRYPTION_KEY=.*$/m.test(source)
    ? source.replace(/^MFA_ENCRYPTION_KEY=.*$/m, line)
    : `${source}\n${line}\n`;
  writeFileSync(".env", updated, { mode: 0o600 });
  process.stdout.write(
    "Local MFA key saved in ignored .env. No key was printed. Back it up securely.\n",
  );
}
