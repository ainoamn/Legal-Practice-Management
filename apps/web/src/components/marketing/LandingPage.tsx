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
    ar: {
      t: "إدارة القضايا بوضوح",
      d: "ملف واحد يجمع الأطراف والحالة والمهام والملاحظات — بلا تشتت بين الجداول.",
    },
    en: {
      t: "Clear matter control",
      d: "One file for parties, status, tasks, and notes—no scattered spreadsheets.",
    },
  },
  {
    icon: CalendarDays,
    ar: {
      t: "جلسات بلا تعارض",
      d: "تقويم قضائي بتوقيت مسقط، وتنبيهات للفريق قبل الموعد.",
    },
    en: {
      t: "Hearings without clashes",
      d: "Court calendar on Muscat time, with reminders before every hearing.",
    },
  },
  {
    icon: FileText,
    ar: {
      t: "وثائق تحت صلاحيات",
      d: "أرشيف محمي، نسخ متتابعة، وتصدير مضبوط لمن يملك الحق فقط.",
    },
    en: {
      t: "Documents under control",
      d: "Protected vault, version history, and exports limited by permission.",
    },
  },
  {
    icon: Users,
    ar: {
      t: "فريق بأدوار دقيقة",
      d: "محامٍ، موظف، عميل — كلٌّ يرى ما يخصّه فقط داخل المكتب.",
    },
    en: {
      t: "Precise team roles",
      d: "Counsel, staff, client—each sees only what belongs to them.",
    },
  },
  {
    icon: ShieldCheck,
    ar: {
      t: "عزل بين المكاتب",
      d: "مستأجرون منفصلون، سجل تدقيق، وجلسة موحّدة عبر هوية بن حمود.",
    },
    en: {
      t: "Office isolation",
      d: "Separate tenants, audit trail, and unified Bin Hamood identity.",
    },
  },
  {
    icon: Building2,
    ar: {
      t: "مالية المكتب",
      d: "فواتير ومصروفات مرتبطة بالقضايا في مساحة واحدة.",
    },
    en: {
      t: "Practice finance",
      d: "Invoices and expenses linked to matters in one workspace.",
    },
  },
] as const;

const ERRORS: Record<"ar" | "en", Record<string, string>> = {
  ar: {
    bhd_state: "انتهت جلسة التحقق. اضغط تسجيل الدخول مرة أخرى.",
    bhd_not_configured: "الدخول الموحّد غير مكتمل الإعداد بعد.",
    bhd_no_office: "لا عضوية مكتب لهذا الحساب. اطلب دعوة من المكتب ثم أعد المحاولة.",
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
          <p className="lo-kicker">
            {isAr ? "منصة بن حمود للمكاتب القانونية" : "Bin Hamood for law offices"}
          </p>
          <p className="lo-wordmark">LEGAL OFFICE AI</p>
          <h1>
            {isAr
              ? "مكتبك… مرتّب، محمي، وجاهز كل صباح"
              : "Your office—ordered, protected, ready each morning"}
          </h1>
          <p className="lo-lead">
            {isAr
              ? "مساحة عمل واحدة للقضايا والجلسات والوثائق والمالية والفريق — بهوية بن حمود ودخول موحّد."
              : "One workspace for matters, hearings, documents, finance, and team—with Bin Hamood unified sign-in."}
          </p>
          <div className="lo-actions">
            <a className="lo-btn-main" href={SSO_START}>
              {isAr ? "تسجيل الدخول بحساب بن حمود" : "Sign in with Bin Hamood"}
              <ArrowUpLeft size={18} />
            </a>
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
          <h2>{isAr ? "لماذا LEGAL OFFICE AI؟" : "Why LEGAL OFFICE AI?"}</h2>
          <p>
            {isAr
              ? "أخذنا إيقاع المكتب العماني الحقيقي، وبنينا مساحة رقمية لا تُجبِرك على أدوات غربية لا تناسبك."
              : "Built around how Omani offices actually work—not a Western tool forced into Arabic."}
          </p>
        </div>
        <div className="lo-features">
          {FEATURES.map((item) => {
            const Icon = item.icon;
            const copy = isAr ? item.ar : item.en;
            return (
              <article key={copy.t} className="lo-feature">
                <Icon size={28} strokeWidth={1.5} />
                <h3>{copy.t}</h3>
                <p>{copy.d}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="lo-showcase" id="inside">
        <div className="lo-section-head">
          <h2>{isAr ? "من داخل النظام" : "Inside the product"}</h2>
          <p>
            {isAr
              ? "واجهات حقيقية لمساحة العمل — لا رسوم توضيحية فارغة."
              : "Real workspace views—not empty illustrations."}
          </p>
        </div>
        <div className="lo-shots">
          <figure className="lo-shot lo-shot-wide">
            <Image
              src="/marketing/atmosphere-hero.jpg"
              alt=""
              width={1600}
              height={900}
              className="lo-shot-bg"
            />
            <Image
              src="/marketing/matters-ui.jpg"
              alt={isAr ? "القضايا والجلسات" : "Matters and hearings"}
              width={1400}
              height={788}
              className="lo-shot-ui"
            />
            <figcaption>{isAr ? "القضايا والجلسات" : "Matters & hearings"}</figcaption>
          </figure>
          <figure className="lo-shot">
            <Image
              src="/marketing/finance-docs-ui.jpg"
              alt={isAr ? "المالية والوثائق" : "Finance and documents"}
              width={1400}
              height={788}
            />
            <figcaption>{isAr ? "المالية والوثائق" : "Finance & documents"}</figcaption>
          </figure>
        </div>
      </section>

      <section className="lo-closing">
        <div className="lo-closing-inner">
          <h2>
            {isAr
              ? "ادخل بحساب بن حمود… وافتح مكتبك في ثوانٍ"
              : "Sign in with Bin Hamood—open your office in seconds"}
          </h2>
          <p>
            {isAr
              ? "نفس الهوية التي تستخدمها في وازن وحسابي ونَسَب وباقي برامج المجموعة."
              : "The same identity you use across Wazen, Hisaby, Nasab, and the suite."}
          </p>
          <div className="lo-actions">
            <a className="lo-btn-main" href={SSO_START}>
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
