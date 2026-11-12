"use client";
import BhdProgramsStrip from "./BhdProgramsStrip";
import "../../bhd-footer.css";
import "../../bhd-programs-strip.css";

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
  const isAr = locale === "ar";

  return (
    <footer className="bhd-site-footer no-print">
      <BhdProgramsStrip variant="footer" locale={locale} />
      <div className="bhd-footer-inner">
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
