"use client";

import { hopOrigins } from "../lib/bhd/apps";
import { getCachedCatalogApps } from "../lib/bhd/catalog";
import { DEFAULT_IDENTITY_ISSUER } from "../lib/identity/issuer";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const SAME_ORIGIN_ROUTES = [
  "/",
  "/app",
  "/admin",
  "/portal",
  "/pages",
] as const;

function addLink(rel: string, href: string, extra: Record<string, string> = {}) {
  const key = `${rel}:${href}`;
  if (document.head.querySelector(`[data-legal-warm="${key}"]`)) return;
  const node = document.createElement("link");
  node.rel = rel;
  node.href = href;
  node.setAttribute("data-legal-warm", key);
  Object.entries(extra).forEach(([name, value]) =>
    node.setAttribute(name, value),
  );
  document.head.appendChild(node);
}

function addSpeculation(pageOrigin: string) {
  if (document.getElementById("legal-speculation")) return;
  const same = SAME_ORIGIN_ROUTES.map((path) =>
    new URL(path, pageOrigin).toString(),
  );
  const script = document.createElement("script");
  script.id = "legal-speculation";
  script.type = "speculationrules";
  script.textContent = JSON.stringify({
    prerender: [{ source: "list", urls: same, eagerness: "immediate" }],
    prefetch: [
      { source: "list", urls: same, eagerness: "immediate" },
      {
        source: "list",
        urls: [
          `${DEFAULT_IDENTITY_ISSUER}/`,
          `${DEFAULT_IDENTITY_ISSUER}/account`,
          "https://www.bhd-om.com/",
          "https://www.bhd-om.com/apps",
        ],
        eagerness: "immediate",
      },
    ],
  });
  document.head.appendChild(script);
}

/** يسخّن صفحات المكتب والهوية فور فتح أي صفحة. */
export function NavigationWarmup() {
  const router = useRouter();

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith("/api/")) return;

    const run = () => {
      const origin = window.location.origin.replace(/\/$/, "");
      SAME_ORIGIN_ROUTES.forEach((route) => router.prefetch(route));
      hopOrigins(getCachedCatalogApps()).forEach((item) => {
        addLink("dns-prefetch", item);
        addLink("preconnect", item);
      });
      addLink("preconnect", DEFAULT_IDENTITY_ISSUER);
      addLink("preconnect", "https://fonts.googleapis.com");
      addLink("preconnect", "https://fonts.gstatic.com", {
        crossorigin: "anonymous",
      });
      SAME_ORIGIN_ROUTES.forEach((route) => {
        addLink("prefetch", `${origin}${route}`, { as: "document" });
      });
      addLink("prefetch", `${DEFAULT_IDENTITY_ISSUER}/account`, {
        as: "document",
      });
      addSpeculation(origin);
    };

    const idle = window.requestIdleCallback?.(run, { timeout: 350 });
    if (idle == null) {
      const timer = window.setTimeout(run, 0);
      return () => window.clearTimeout(timer);
    }
    return () => window.cancelIdleCallback?.(idle);
  }, [router]);

  return null;
}
