"use client";
import { launchUrlForApp } from "../../lib/bhd/apps";
import { useBhdCatalog } from "../../lib/identity/use-bhd-catalog";
import { BhdAppIcon } from "./BhdAppIcon";
import "../../bhd-footer.css";

const PORTAL = "https://www.bhd-om.com";

const COMPANY_LINKS = [
  { href: `${PORTAL}/about`, ar: "عن بن حمود", en: "About" },
  { href: `${PORTAL}/brand`, ar: "الهوية", en: "Brand" },
  { href: `${PORTAL}/apps`, ar: "التطبيقات", en: "Apps" },
  { href: `${PORTAL}/privacy`, ar: "الخصوصية", en: "Privacy" },
  { href: `${PORTAL}/terms`, ar: "الشروط", en: "Terms" },
  { href: `${PORTAL}/security`, ar: "الأمان", en: "Security" },
] as const;

export function BhdSiteFooter({ locale = "ar" }: { locale?: "ar" | "en" }) {
  const catalogApps = useBhdCatalog();
  const isAr = locale === "ar";
  const programs = catalogApps.filter(
    (app) => app.enabled && app.id !== "account",
  );

  return (
    <footer className="bhd-site-footer no-print">
      <div className="bhd-footer-inner">
        <div className="bhd-footer-programs-head">
          <p>{isAr ? "برامجنا" : "Our apps"}</p>
          <a href={`${PORTAL}/apps`}>{isAr ? "كل التطبيقات" : "All apps"}</a>
        </div>
        <div className="bhd-footer-programs-grid">
          {programs.map((app) => {
            const href =
              app.mode === "identity"
                ? `${app.origin.replace(/\/$/, "")}${app.workspacePath}`
                : launchUrlForApp(app) || `${PORTAL}/apps`;
            return (
              <a
                key={app.id}
                href={href}
                className="bhd-footer-program"
                title={isAr ? app.nameAr : app.nameEn}
              >
                <BhdAppIcon
                  id={app.id}
                  title={isAr ? app.nameAr : app.nameEn}
                  logoUrl={app.logoUrl}
                  soft={app.soft}
                  accent={app.accent}
                />
                <span>{isAr ? app.nameAr : app.nameEn}</span>
              </a>
            );
          })}
        </div>
        <div className="bhd-footer-links">
          {COMPANY_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {isAr ? link.ar : link.en}
            </a>
          ))}
          <a href="/admin">{isAr ? "إدارة المنصة" : "Platform admin"}</a>
        </div>
        <p className="bhd-footer-copy">
          {isAr
            ? "© بن حمود للتطوير — Bin Hamood Development"
            : "© Bin Hamood Development"}
        </p>
      </div>
    </footer>
  );
}
