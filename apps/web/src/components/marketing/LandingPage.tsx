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
    n: "01",
    icon: Scale,
    ar: {
      t: "قضية واحدة… مسار واحد",
      d: "الأطراف والحالة والمهام والملاحظات في ملف يتسع للمكتب كله دون فوضى الجداول.",
    },
    en: {
      t: "One matter, one path",
      d: "Parties, status, tasks, and notes in a single file—without spreadsheet chaos.",
    },
  },
  {
    n: "02",
    icon: CalendarDays,
    ar: {
      t: "الجلسة قبل أن تُنسى",
      d: "تقويم قضائي بتوقيت مسقط، وتنبيه يصل للفريق قبل الموعد لا بعده.",
    },
    en: {
      t: "Hearings remembered",
      d: "Muscat-time court calendar, with reminders that arrive before the hearing.",
    },
  },
  {
    n: "03",
    icon: FileText,
    ar: {
      t: "وثيقة لها حارس",
      d: "أرشيف بنسخ وصلاحيات؛ من لا يملك الحق لا يرى الملف أصلاً.",
    },
    en: {
      t: "Documents with a guard",
      d: "Versioned vault with permissions—if you lack access, the file stays invisible.",
    },
  },
  {
    n: "04",
    icon: Users,
    ar: {
      t: "أدوار لا تلتبس",
      d: "محامٍ وموظف وعميل — كلٌّ على مساحته داخل المكتب نفسه.",
    },
    en: {
      t: "Roles that stay clear",
      d: "Counsel, staff, client—each on their own plane inside the same office.",
    },
  },
  {
    n: "05",
    icon: ShieldCheck,
    ar: {
      t: "عزل لا يُخترق",
      d: "مستأجرون منفصلون، سجل تدقيق، وهوية بن حمود لجلسة موحّدة.",
    },
    en: {
      t: "Isolation that holds",
      d: "Separate tenants, audit trail, and Bin Hamood identity for one session.",
    },
  },
  {
    n: "06",
    icon: Building2,
    ar: {
      t: "مالية مربوطة بالقضية",
      d: "فواتير ومصروفات تظهر حيث يعمل الفريق — لا في جدول منفصل.",
    },
    en: {
      t: "Finance tied to the matter",
      d: "Invoices and expenses live where the team works—not in a side spreadsheet.",
    },
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
    <div className={`lo ${ready ? "is-live" : ""}`}>
      <div className="lo-flag" aria-hidden="true" />

      <BhdMarketingChrome
        locale={locale}
        onLocaleChange={setLocale}
        brandMark={
          <span className="lo-seal" aria-hidden>
            <Scale size={18} />
          </span>
        }
        brand={<strong className="lo-chrome-name">LEGAL OFFICE AI</strong>}
      />

      {authError ? (
        <div className="lo-alert" role="alert">
          <p>{authError}</p>
          <button type="button" onClick={() => setAuthError("")} aria-label="Close">
            <X size={16} />
          </button>
        </div>
      ) : null}

      <section className="lo-hero">
        <div className="lo-hero-bg" aria-hidden="true">
          <Image
            src="/marketing/chamber-hero.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="lo-hero-photo"
          />
          <div className="lo-hero-veil" />
        </div>

        <div className="lo-hero-core">
          <p className="lo-eyebrow">
            {isAr ? "منصة بن حمود · عُمان" : "Bin Hamood · Oman"}
          </p>
          <p className="lo-display-brand">LEGAL OFFICE AI</p>
          <h1>
            {isAr ? (
              <>
                مكتبك القانوني
                <span>بوضوحٍ يُشبه الصباح</span>
              </>
            ) : (
              <>
                Your law office
                <span>with morning clarity</span>
              </>
            )}
          </h1>
          <p className="lo-lead">
            {isAr
              ? "قضايا، جلسات، وثائق، مالية، وفريق — في مساحة واحدة بهوية بن حمود ودخول موحّد."
              : "Matters, hearings, documents, finance, and team—in one workspace with Bin Hamood sign-in."}
          </p>
          <div className="lo-cta">
            <a className="lo-primary" href={SSO_START}>
              {isAr ? "دخول بحساب بن حمود" : "Sign in with Bin Hamood"}
              <ArrowUpLeft size={18} />
            </a>
            <a className="lo-secondary" href="#inside">
              {isAr ? "استكشف من الداخل" : "Explore inside"}
            </a>
          </div>
        </div>

        <div className="lo-hero-product">
          <div className="lo-laptop">
            <Image
              src="/marketing/hero-dashboard.jpg"
              alt={isAr ? "لوحة المكتب" : "Office dashboard"}
              width={1600}
              height={900}
              priority
            />
          </div>
        </div>
      </section>

      <section className="lo-block" id="why">
        <div className="lo-block-intro">
          <p className="lo-label">{isAr ? "لماذا نحن" : "Why us"}</p>
          <h2>
            {isAr
              ? "صُمم لمكتبٍ يعمل في مسقط… لا لترجمةٍ عن الغرب"
              : "Designed for offices in Muscat—not a Western port"}
          </h2>
        </div>
        <ol className="lo-manifest">
          {FEATURES.map((item) => {
            const Icon = item.icon;
            const copy = isAr ? item.ar : item.en;
            return (
              <li key={item.n} className="lo-manifest-row">
                <span className="lo-num" aria-hidden>
                  {item.n}
                </span>
                <div className="lo-manifest-body">
                  <Icon size={22} strokeWidth={1.5} />
                  <h3>{copy.t}</h3>
                  <p>{copy.d}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="lo-gallery" id="inside">
        <div className="lo-block-intro">
          <p className="lo-label">{isAr ? "من الداخل" : "Inside"}</p>
          <h2>
            {isAr
              ? "المساحة كما يراها المكتب كل يوم"
              : "The workspace as the office sees it daily"}
          </h2>
        </div>
        <div className="lo-gallery-grid">
          <figure className="lo-frame lo-frame-a">
            <Image
              src="/marketing/matters-ui.jpg"
              alt={isAr ? "القضايا" : "Matters"}
              width={1400}
              height={788}
            />
            <figcaption>{isAr ? "القضايا والجلسات" : "Matters & hearings"}</figcaption>
          </figure>
          <figure className="lo-frame lo-frame-b">
            <Image
              src="/marketing/finance-docs-ui.jpg"
              alt={isAr ? "المالية" : "Finance"}
              width={1400}
              height={788}
            />
            <figcaption>{isAr ? "المالية والوثائق" : "Finance & documents"}</figcaption>
          </figure>
          <figure className="lo-frame lo-frame-c">
            <Image
              src="/marketing/atmosphere-hero.jpg"
              alt=""
              width={1400}
              height={788}
            />
            <figcaption>{isAr ? "جو المكتب" : "Office atmosphere"}</figcaption>
          </figure>
        </div>
      </section>

      <section className="lo-finale">
        <div className="lo-finale-panel">
          <p className="lo-label">{isAr ? "ابدأ الآن" : "Start now"}</p>
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
          <div className="lo-cta">
            <a className="lo-primary lo-primary-light" href={SSO_START}>
              {isAr ? "المتابعة إلى الهوية" : "Continue to Identity"}
              <ArrowUpLeft size={18} />
            </a>
            <Link className="lo-ghost" href="/app" prefetch>
              {isAr ? "حساب المكتب المحلي" : "Local office account"}
            </Link>
          </div>
        </div>
      </section>

      <BhdSiteFooter locale={locale} />
    </div>
  );
}
