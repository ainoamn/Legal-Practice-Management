import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
const config: NextConfig = {
  outputFileTracingRoot: path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  ),
  transpilePackages: ["@legal/contracts"],
  async rewrites() {
    const api =
      process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4311";
    return [
      {
        source: "/api/auth/bhd/ready",
        destination: `${api}/api/v1/auth/bhd/ready`,
      },
      {
        source: "/api/auth/bhd/logout",
        destination: `${api}/api/v1/auth/bhd/logout`,
      },
      {
        source: "/api/auth/bhd/rebind",
        destination: `${api}/api/v1/auth/bhd/rebind`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${api}/api/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
