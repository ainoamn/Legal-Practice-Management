"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpLeft,
  BookOpen,
  Building2,
  CalendarDays,
  FileText,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  BhdMarketingChrome,
  SSO_START,
} from "../bhd/BhdMarketingChrome";
import { BhdSiteFooter } from "../bhd/BhdSiteFooter";

const FEATURES = [
  {
    icon: Scale,
    ar: { t: "إدارة القضايا", d: "ملف واحد للأطراف والحالة والمهام والملاحظات." },
    en: { t: "Matter control", d: "One file for parties, status, tasks, and notes." },
  },
  {
    icon: CalendarDays,
    ar: { t: "التقويم القضائي", d: "جلسات بتوقيت مسقط وتنبيهات قبل الموعد." },
    en: { t: "Court calendar", d: "Muscat-time hearings with reminders before the day." },
  },
  {
    icon: FileText,
    ar: { t: "الوثائق والعقود", d: "أرشيف بنسخ وصلاحيات؛ من لا يملك الحق لا يرى الملف." },
    en: { t: "Documents", d: "Versioned vault with permissions—no access, no file." },
  },
  {
    icon: Users,
    ar: { t: "الفريق والأدوار", d: "محامٍ وموظف وعميل — كلٌّ على مساحته داخل المكتب." },
    en: { t: "Team & roles", d: "Counsel, staff, client—each on their own plane." },
  },
  {
    icon: ShieldCheck,
    ar: { t: "عزل المكاتب", d: "مستأجرون منفصلون وسجل تدقيق وهوية بن حمود موحّدة." },
    en: { t: "Office isolation", d: "Separate tenants, audit trail, and Bin Hamood SSO." },
  },
  {
    icon: Building2,
    ar: { t: "مالية المكتب", d: "فواتير ومصروفات مربوطة بالقضايا في مساحة واحدة." },
    en: { t: "Practice finance", d: "Invoices and expenses linked to matters in one place." },
  },
  {
    icon: BookOpen,
    ar: { t: "مكتبة القوانين", d: "قوانين عمانية للقراءة صفحة بصفحة مع ترويسة رسمية للطباعة." },
    en: { t: "Laws library", d: "Omani laws to read page by page with an official printable letterhead." },
  },
] as const;

const SHOTS = [
  {
    src: "/marketing/hero-dashboard.jpg",
    ar: "لوحة المكتب",
    en: "Office dashboard",
  },
  {
    src: "/marketing/matters-ui.jpg",
    ar: "القضايا والجلسات",
    en: "Matters & hearings",
  },
  {
    src: "/marketing/finance-docs-ui.jpg",
    ar: "المالية والوثائق",
    en: "Finance & documents",
  },
] as const;

const ERRORS: Record<"ar" | "en", Record<string, string>> = {
  ar: {
    bhd_state: "انتهت جلسة التحقق. سجّل الدخول مرة أخرى.",
    bhd_not_configured: "الدخول الموحّد غير مكتمل الإعداد بعد.",
    bhd_no_office: "لا عضوية مكتب لهذا الحساب. اطلب دعوة ثم أعد المحاولة.",
    bhd_token: "تعذّر إكمال الدخول الموحّد. حاول مجدداً.",
    bhd_callback: "فشل التحقق من الهوية. حاول مجدداً.",
  },
  en: {
    bhd_state: "Login verification expired. Sign in again.",
    bhd_not_configured: "Unified login is not fully configured yet.",
    bhd_no_office: "No office membership for this account. Ask for an invite, then retry.",
    bhd_token: "Could not complete unified login. Try again.",
    bhd_callback: "Identity verification failed. Try again.",
  },
};

export function LandingPage() {
  const [locale, setLocale] = useState<"ar" | "en">("ar");
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const isAr = locale === "ar";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    const id = window.requestAnimationFrame(() => setReady(true));
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err?.startsWith("bhd_")) {
      setAuthError(ERRORS[locale][err] ?? err);
      window.history.replaceState({}, "", window.location.pathname);
    }
    return () => window.cancelAnimationFrame(id);
  }, [locale]);

  return (
    <div className={`lo-home ${ready ? "is-live" : ""}`}>
      <div className="lo-flag" aria-hidden="true" />

      <BhdMarketingChrome
        locale={locale}
        onLocaleChange={setLocale}
        brandMark={
          <span className="lo-mark" aria-hidden>
            <Scale size={18} />
          </span>
        }
        brand={
          <span className="lo-brand-copy">
            <strong>LEGAL OFFICE AI</strong>
            <small>{isAr ? "المكتب القانوني" : "Legal Office"}</small>
          </span>
        }
      />

      {authError ? (
        <div className="lo-banner" role="alert">
          <span>{authError}</span>
          <button type="button" onClick={() => setAuthError("")} aria-label="Close">
            <X size={16} />
          </button>
        </div>
      ) : null}

      <section className="lo-hero">
        <div className="lo-hero-copy">
          <p className="lo-badge">
            <Sparkles size={14} />
            {isAr ? "منصة بن حمود للمكاتب القانونية" : "Bin Hamood for law offices"}
          </p>
          <h1>
            {isAr ? (
              <>
                مكتبك القانوني،{" "}
                <span>مرتّب ومحمي بوضوح</span>
              </>
            ) : (
              <>
                Your law office,{" "}
                <span>ordered and protected</span>
              </>
            )}
          </h1>
          <p className="lo-lead">
            {isAr
              ? "قضايا وجلسات ووثائق ومالية وفريق — في مساحة واحدة بهوية بن حمود ودخول موحّد."
              : "Matters, hearings, documents, finance, and team—in one workspace with Bin Hamood sign-in."}
          </p>
          <div className="lo-actions">
            <a className="lo-btn-main" href={SSO_START}>
              {isAr ? "دخول بحساب بن حمود" : "Sign in with Bin Hamood"}
              <ArrowUpLeft size={18} />
            </a>
            <Link className="lo-btn-soft" href="/laws" prefetch>
              {isAr ? "مكتبة القوانين" : "Laws library"}
            </Link>
            <a className="lo-btn-soft" href="#inside">
              {isAr ? "شاهد من الداخل" : "See inside"}
            </a>
          </div>
          <p className="lo-trust">
            {isAr
              ? "مجانية للتجربة · بلا بطاقة · بيانات مكتبك ملكك"
              : "Try free · no card · your office data stays yours"}
          </p>
        </div>

        <div className="lo-hero-stage">
          <div className="lo-hero-glow" aria-hidden />
          <div className="lo-device">
            <Image
              src="/marketing/hero-dashboard.jpg"
              alt={isAr ? "لوحة المكتب القانوني" : "Legal office dashboard"}
              width={1600}
              height={900}
              priority
              className="lo-device-shot"
            />
          </div>
        </div>
      </section>

      <section className="lo-section" id="why">
        <div className="lo-section-head">
          <p className="lo-label">{isAr ? "المزايا" : "Features"}</p>
          <h2>
            {isAr
              ? "كل ما يحتاجه المكتب… في مكان واحد"
              : "Everything the office needs—in one place"}
          </h2>
          <p>
            {isAr
              ? "صُمم لإيقاع المكتب العماني، لا لترجمة أداة غربية."
              : "Built for how Omani offices work—not a Western tool in Arabic."}
          </p>
        </div>
        <div className="lo-features">
          {FEATURES.map((item) => {
            const Icon = item.icon;
            const copy = isAr ? item.ar : item.en;
            return (
              <article key={copy.t} className="lo-feature">
                <span className="lo-feature-icon" aria-hidden>
                  <Icon size={22} strokeWidth={1.6} />
                </span>
                <h3>{copy.t}</h3>
                <p>{copy.d}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="lo-showcase" id="inside">
        <div className="lo-section-head">
          <p className="lo-label">{isAr ? "من الداخل" : "Inside"}</p>
          <h2>
            {isAr ? "المساحة كما يراها المكتب" : "The workspace as the office sees it"}
          </h2>
          <p>
            {isAr
              ? "واجهات حقيقية لمساحة العمل — لا رسوم فارغة."
              : "Real workspace views—not empty illustrations."}
          </p>
        </div>
        <div className="lo-shots">
          {SHOTS.map((shot, index) => (
            <figure
              key={shot.src}
              className={index === 0 ? "lo-shot lo-shot-wide" : "lo-shot"}
            >
              <Image
                src={shot.src}
                alt={isAr ? shot.ar : shot.en}
                width={index === 0 ? 1600 : 1400}
                height={index === 0 ? 900 : 788}
              />
              <figcaption>{isAr ? shot.ar : shot.en}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="lo-closing">
        <div className="lo-closing-inner">
          <p className="lo-label lo-label-light">
            {isAr ? "ابدأ الآن" : "Start now"}
          </p>
          <h2>
            {isAr
              ? "حساب بن حمود واحد… ومكتبك يفتح"
              : "One Bin Hamood account—your office opens"}
          </h2>
          <p>
            {isAr
              ? "نفس الهوية في وازن وحسابي ونَسَب وباقي برامج المجموعة."
              : "The same identity across Wazen, Hisaby, Nasab, and the suite."}
          </p>
          <div className="lo-actions lo-actions-center">
            <a className="lo-btn-main lo-btn-on-dark" href={SSO_START}>
              {isAr ? "المتابعة إلى الهوية" : "Continue to Identity"}
              <ArrowUpLeft size={18} />
            </a>
            <Link className="lo-btn-ghost" href="/app" prefetch>
              {isAr ? "حساب المكتب المحلي" : "Local office account"}
            </Link>
          </div>
        </div>
      </section>

      <BhdSiteFooter locale={locale} />
    </div>
  );
}
