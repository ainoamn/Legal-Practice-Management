import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const IDENTITY_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://id.bhd-om.com https://fonts.googleapis.com",
  "connect-src 'self' https://id.bhd-om.com https://*.bhd-om.com https: wss:",
  "img-src 'self' data: blob: https://id.bhd-om.com https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "frame-src https://id.bhd-om.com",
].join("; ");

const config: NextConfig = {
  outputFileTracingRoot: path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  ),
  transpilePackages: ["@legal/contracts"],
  async rewrites() {
    const api = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4311";
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
          { key: "Content-Security-Policy", value: IDENTITY_CSP },
        ],
      },
    ];
  },
};
export default config;
