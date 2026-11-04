"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpLeft,
  Building2,
  CalendarDays,
  FileText,
  Scale,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  BhdMarketingChrome,
  SSO_START,
} from "../bhd/BhdMarketingChrome";
import { BhdSiteFooter } from "../bhd/BhdSiteFooter";

const PILLARS = [
  {
    icon: Scale,
    ar: { t: "القضايا", d: "ملف القضية، الأطراف، الحالة، والمهام في مسار واحد." },
    en: { t: "Matters", d: "Case file, parties, status, and tasks on one track." },
  },
  {
    icon: CalendarDays,
    ar: { t: "الجلسات", d: "تقويم بلا تعارض، بتنبيه الفريق قبل الموعد." },
    en: { t: "Hearings", d: "Conflict-aware calendar with team reminders." },
  },
  {
    icon: FileText,
    ar: { t: "الوثائق", d: "أرشيف محمي بصلاحيات ونسخ وتتبع." },
    en: { t: "Documents", d: "Protected vault with versions and audit." },
  },
  {
    icon: Users,
    ar: { t: "الفريق", d: "أدوار دقيقة للمحامي والموظف والعميل." },
    en: { t: "Team", d: "Precise roles for counsel, staff, and clients." },
  },
] as const;

export function LandingPage() {
  const [locale, setLocale] = useState<"ar" | "en">("ar");
  const [ready, setReady] = useState(false);
  const isAr = locale === "ar";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    const id = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(id);
  }, [locale]);

  return (
    <div className={`legal-home ${ready ? "is-live" : ""}`}>
      <div className="legal-flag" aria-hidden="true" />

      <BhdMarketingChrome
        locale={locale}
        onLocaleChange={setLocale}
        brandMark={
          <span className="legal-home-mark" aria-hidden>
            <Scale size={20} />
          </span>
        }
        brand={
          <span className="legal-home-brand-text">
            <strong>LEGAL OFFICE AI</strong>
            <small>{isAr ? "مساحة المكتب القانوني" : "Legal practice workspace"}</small>
          </span>
        }
      />

      <section className="legal-hero">
        <div className="legal-hero-media" aria-hidden="true">
          <Image
            src="/marketing/hero-dashboard.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="legal-hero-photo"
          />
          <div className="legal-hero-veil" />
          <div className="legal-hero-grain" />
        </div>

        <div className="legal-hero-stage">
          <p className="legal-hero-brand">LEGAL OFFICE AI</p>
          <h1>
            {isAr
              ? "مساحة عمل المكتب القانوني… كما يجب أن تكون"
              : "The law office workspace—as it should be"}
          </h1>
          <p className="legal-hero-lead">
            {isAr
              ? "قضايا، جلسات، وثائق، مالية، وفريق — في منصة بن حمود، بعزل صارم بين المكاتب ودخول موحّد."
              : "Matters, hearings, documents, finance, and team—on Bin Hamood, with strict office isolation and unified sign-in."}
          </p>
          <div className="legal-hero-actions">
            <a className="legal-btn-primary" href={SSO_START}>
              {isAr ? "تسجيل الدخول بحساب بن حمود" : "Sign in with Bin Hamood"}
              <ArrowUpLeft size={18} />
            </a>
            <Link className="legal-btn-ghost" href="/app" prefetch>
              <Building2 size={17} />
              {isAr ? "دخول حساب المكتب" : "Office account login"}
            </Link>
          </div>
          <p className="legal-hero-note">
            <ShieldCheck size={16} />
            {isAr
              ? "هوية بن حمود · جلسة موحّدة · عزل المستأجرين · سجل تدقيق"
              : "BHD Identity · unified session · tenant isolation · audit trail"}
          </p>
        </div>
      </section>

      <section className="legal-band" id="capabilities">
        <div className="legal-band-head">
          <p className="legal-eyebrow">{isAr ? "القدرات" : "Capabilities"}</p>
          <h2>
            {isAr
              ? "كل مسار المكتب في إيقاع واحد"
              : "The whole office rhythm, in one beat"}
          </h2>
        </div>
        <div className="legal-pillars">
          {PILLARS.map((item) => {
            const Icon = item.icon;
            const copy = isAr ? item.ar : item.en;
            return (
              <article key={copy.t} className="legal-pillar">
                <Icon size={26} strokeWidth={1.6} />
                <h3>{copy.t}</h3>
                <p>{copy.d}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="legal-cinema" id="inside">
        <div className="legal-band-head">
          <p className="legal-eyebrow">{isAr ? "من الداخل" : "Inside"}</p>
          <h2>
            {isAr ? "شاهد مساحة العمل كما يستخدمها المكتب" : "See the workspace as offices use it"}
          </h2>
        </div>
        <div className="legal-frames">
          <figure className="legal-frame is-lead">
            <Image
              src="/marketing/hero-dashboard.jpg"
              alt={isAr ? "لوحة المكتب" : "Office dashboard"}
              width={1600}
              height={900}
              sizes="(max-width: 900px) 100vw, 70vw"
            />
            <figcaption>{isAr ? "لوحة المكتب" : "Dashboard"}</figcaption>
          </figure>
          <figure className="legal-frame">
            <Image
              src="/marketing/matters-ui.jpg"
              alt={isAr ? "القضايا والجلسات" : "Matters"}
              width={1600}
              height={900}
              sizes="(max-width: 900px) 100vw, 40vw"
            />
            <figcaption>{isAr ? "القضايا والجلسات" : "Matters & hearings"}</figcaption>
          </figure>
          <figure className="legal-frame">
            <Image
              src="/marketing/finance-docs-ui.jpg"
              alt={isAr ? "المالية والوثائق" : "Finance"}
              width={1600}
              height={900}
              sizes="(max-width: 900px) 100vw, 40vw"
            />
            <figcaption>{isAr ? "المالية والوثائق" : "Finance & documents"}</figcaption>
          </figure>
        </div>
      </section>

      <section className="legal-sso">
        <div className="legal-sso-panel">
          <p className="legal-eyebrow">{isAr ? "الدخول الموحّد" : "Unified login"}</p>
          <h2>
            {isAr
              ? "حساب بن حمود واحد… لكل برامج المجموعة"
              : "One Bin Hamood account across the suite"}
          </h2>
          <p>
            {isAr
              ? "ادخل من هنا، أو من مشغّل التطبيقات في الهيدر، أو من أي منتج في المنظومة — نفس الهوية، نفس الجلسة."
              : "Sign in here, from the header app launcher, or any suite product—same identity, same session."}
          </p>
          <div className="legal-hero-actions">
            <a className="legal-btn-primary" href={SSO_START}>
              {isAr ? "المتابعة إلى الهوية" : "Continue to Identity"}
              <ArrowUpLeft size={18} />
            </a>
            <Link className="legal-btn-ghost" href="/app" prefetch>
              {isAr ? "حساب المكتب المحلي" : "Local office account"}
            </Link>
          </div>
        </div>
      </section>

      <BhdSiteFooter locale={locale} />
    </div>
  );
}
