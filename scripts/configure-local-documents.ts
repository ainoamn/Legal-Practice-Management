import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parse } from "dotenv";
if (process.env.NODE_ENV === "production")
  throw new Error("Local setup cannot run in production");
mkdirSync(".local", { recursive: true });
const identities: {
  name: string;
  credentials: { accessKey: string; secretKey: string }[];
  actions: string[];
}[] = [];
for (const [filename, bucket] of [
  [".env", "legal-dev"],
  [".env.test", "legal-test"],
]) {
  if (!filename || !bucket || !existsSync(filename))
    throw new Error(
      "Initialize .env and .env.test before local document setup",
    );
  const content = readFileSync(filename, "utf8"),
    settings = parse(content);
  const values: Record<string, string> = {
    S3_ENDPOINT: "http://127.0.0.1:4320",
    S3_REGION: "us-east-1",
    S3_BUCKET: bucket,
    S3_ACCESS_KEY_ID: randomBytes(12).toString("hex"),
    S3_SECRET_ACCESS_KEY: randomBytes(32).toString("hex"),
    DOCUMENT_TOOLS_WSL_DISTRO: "Ubuntu",
  };
  for (const [key, value] of Object.entries(values))
    if (!settings[key]) settings[key] = value;
  if (settings.S3_ENDPOINT !== "http://127.0.0.1:4320")
    throw new Error(
      "Refusing to modify a configured external storage endpoint",
    );
  const added = Object.keys(values).filter((key) => !parse(content)[key]);
  let next = content;
  for (const key of added) {
    const expression = new RegExp(`^${key}=.*$`, "m");
    if (expression.test(next))
      next = next.replace(expression, `${key}=${settings[key]}`);
    else next += `\n${key}=${settings[key]}`;
  }
  if (added.length) writeFileSync(filename, next + "\n", { mode: 0o600 });
  identities.push({
    name: bucket,
    credentials: [
      {
        accessKey: settings.S3_ACCESS_KEY_ID!,
        secretKey: settings.S3_SECRET_ACCESS_KEY!,
      },
    ],
    actions: [
      `Admin:${bucket}`,
      `Read:${bucket}`,
      `Write:${bucket}`,
      `List:${bucket}`,
      `Tagging:${bucket}`,
    ],
  });
}
writeFileSync(".local/s3-config.json", JSON.stringify({ identities }), {
  mode: 0o600,
});
if (!existsSync(".local/security.toml"))
  writeFileSync(
    ".local/security.toml",
    `[cors.allowed_origins]\nvalues = "http://localhost:4310"\n[access]\nui = false\n[filer.expose_directory_metadata]\nenabled = false\n${["jwt.signing", "jwt.signing.read", "jwt.filer_signing", "jwt.filer_signing.read"].map((section) => `[${section}]\nkey = "${randomBytes(32).toString("hex")}"\nexpires_after_seconds = 30`).join("\n")}\n`,
    { mode: 0o600 },
  );
process.stdout.write(
  "Local private S3 settings saved. Secrets were not printed. Start the loopback-only storage service.\n",
);
