import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
if (process.env.NODE_ENV === "production" || process.platform !== "win32")
  throw new Error("This helper is for local Windows/WSL development only");
if (!existsSync(".local/s3-config.json") || !existsSync(".local/security.toml"))
  throw new Error("Run npm run storage:setup first");
const configDir = resolve(".local");
const linux = `/mnt/${configDir[0]!.toLowerCase()}${configDir.slice(2).replaceAll("\\", "/")}`;
const child = spawn(
  "wsl.exe",
  [
    "-d",
    "Ubuntu",
    "--exec",
    "bash",
    "-c",
    'mkdir -p "$HOME/.local/share/legal-s3"; exec /usr/local/bin/weed -config_dir="$1" mini -dir="$HOME/.local/share/legal-s3" -ip=127.0.0.1 -ip.bind=127.0.0.1 -s3.port=4320 -s3.config="$1/s3-config.json" -bucket=legal-dev,legal-test -admin.ui=false -webdav=false -volume.max=4 -filer.exposeDirectoryData=false',
    "legal-storage",
    linux,
  ],
  { stdio: "inherit", windowsHide: true },
);
child.on("exit", (code) => process.exit(code ?? 1));
process.on("SIGINT", () => child.kill("SIGINT"));
