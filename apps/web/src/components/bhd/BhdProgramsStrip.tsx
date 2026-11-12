"use client";

import { useEffect, useState } from "react";
import type { BhdApp } from "@/lib/bhd/apps";
import { fetchIdentityCatalog } from "@/lib/bhd/catalog";
import { DEFAULT_IDENTITY_ISSUER } from "@/lib/bhd/identity-public";
import { BhdAppIcon } from "./BhdAppIcon";

function launchHref(app: BhdApp): string {
  if (app.mode === "identity") return `${DEFAULT_IDENTITY_ISSUER}${app.workspacePath}`;
  if (app.startUrl) return app.startUrl;
  return app.origin;
}

type Variant = "footer" | "header";

export default function BhdProgramsStrip({
  variant = "footer",
  locale = "ar",
}: {
  variant?: Variant;
  locale?: "ar" | "en";
}) {
  const [apps, setApps] = useState<BhdApp[]>([]);
  const isAr = locale === "ar";

  useEffect(() => {
    let alive = true;
    void fetchIdentityCatalog().then((list) => {
      if (alive) setApps(list.filter((a) => a.enabled && a.id !== "account"));
    });
    const onCatalog = () => {
      void fetchIdentityCatalog().then((list) => {
        if (alive) setApps(list.filter((a) => a.enabled && a.id !== "account"));
      });
    };
    window.addEventListener("bhd-catalog", onCatalog);
    return () => {
      alive = false;
      window.removeEventListener("bhd-catalog", onCatalog);
    };
  }, []);

  if (!apps.length) return null;

  if (variant === "header") {
    return (
      <nav className="bhd-programs-strip bhd-programs-strip--header" aria-label="برامج BHD" dir="rtl">
        {apps.map((app) => (
          <a
            key={app.id}
            href={launchHref(app)}
            className="bhd-programs-strip-icon"
            title={isAr ? app.nameAr : app.nameEn}
          >
            <BhdAppIcon
              id={app.id}
              title={isAr ? app.nameAr : app.nameEn}
              logoUrl={app.logoUrl}
              soft={app.soft}
              accent={app.accent}
            />
          </a>
        ))}
      </nav>
    );
  }

  return (
    <section className="bhd-programs-strip bhd-programs-strip--footer" aria-label="برامج BHD" dir="rtl">
      <div className="bhd-programs-strip-inner">
        <span className="bhd-programs-strip-label">برامج BHD</span>
        {apps.map((app) => (
          <a key={app.id} href={launchHref(app)} className="bhd-programs-strip-chip">
            <BhdAppIcon
              id={app.id}
              title={isAr ? app.nameAr : app.nameEn}
              logoUrl={app.logoUrl}
              soft={app.soft}
              accent={app.accent}
            />
            <span>{isAr ? app.nameAr : app.nameEn}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
