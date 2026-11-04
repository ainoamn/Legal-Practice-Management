"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpLeft,
  CalendarDays,
  FileText,
  Globe,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { BhdSiteFooter } from "../bhd/BhdSiteFooter";

const FEATURES = [
  {
    icon: Scale,
    ar: { title: "إدارة القضايا", text: "ملفات، جلسات، ومهام الفريق في مساحة واحدة." },
    en: { title: "Matter control", text: "Files, hearings, and team tasks in one workspace." },
  },
  {
    icon: FileText,
    ar: { title: "الوثائق والعقود", text: "أرشفة آمنة، نسخ، وتصدير بضوابط صلاحيات." },
    en: { title: "Documents", text: "Secure vault, versions, and exports with permissions." },
  },
  {
    icon: CalendarDays,
    ar: { title: "التقويم القضائي", text: "جلسات ومواعيد بلا تعارض، بتوقيت مسقط." },
    en: { title: "Court calendar", text: "Hearings without conflicts, Muscat timezone." },
  },
  {
    icon: Users,
    ar: { title: "الفريق والأدوار", text: "صلاحيات دقيقة لكل محامٍ وموظف وعميل." },
    en: { title: "Team & roles", text: "Precise permissions for lawyers, staff, and clients." },
  },
] as const;

const GALLERY = [
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

export function LandingPage() {
  const [locale, setLocale] = useState<"ar" | "en">("ar");
  const [visible, setVisible] = useState(false);
  const isAr = locale === "ar";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    const id = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, [locale]);

  return (
    <div className={`landing ${visible ? "is-ready" : ""}`}>
      <header className="landing-top">
        <Link href="/" className="landing-brand" prefetch>
          <span className="landing-brand-mark" aria-hidden>
            <Scale size={22} />
          </span>
          <span>
            LEGAL OFFICE AI
            <small>{isAr ? "مساحة المكتب القانوني" : "Legal practice workspace"}</small>
          </span>
        </Link>
        <nav className="landing-nav" aria-label={isAr ? "التنقل" : "Navigation"}>
          <a href="#inside">{isAr ? "من الداخل" : "Inside"}</a>
          <a href="#capabilities">{isAr ? "القدرات" : "Capabilities"}</a>
          <button
            type="button"
            className="icon-button"
            onClick={() => setLocale(isAr ? "en" : "ar")}
            aria-label={isAr ? "English" : "العربية"}
          >
            <Globe size={17} />
            <span>{isAr ? "EN" : "ع"}</span>
          </button>
          <Link className="secondary" href="/app" prefetch>
            {isAr ? "دخول المكتب" : "Office login"}
          </Link>
          <Link className="primary" href="/app" prefetch>
            {isAr ? "ابدأ الآن" : "Get started"}
            <ArrowUpLeft size={17} />
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-kicker">
            <Sparkles size={16} />
            {isAr ? "منصة بن حمود للمكاتب القانونية" : "Bin Hamood legal offices platform"}
          </p>
          <h1>
            {isAr
              ? "مكتبك القانوني… منظّم، آمن، وجاهز للعمل"
              : "Your law office—organized, secure, ready"}
          </h1>
          <p className="landing-lead">
            {isAr
              ? "إدارة القضايا والجلسات والوثائق والمالية والفريق في مساحة واحدة مبنية لعُمان، مع عزل كامل بين المكاتب وصلاحيات دقيقة."
              : "Matters, hearings, documents, finance, and team in one Oman-first workspace with strict office isolation."}
          </p>
          <div className="landing-cta">
            <Link className="primary landing-cta-main" href="/app" prefetch>
              {isAr ? "ادخل مساحة المكتب" : "Enter workspace"}
              <ArrowUpLeft size={18} />
            </Link>
            <a className="secondary" href="#inside">
              {isAr ? "شاهد النظام من الداخل" : "See inside the product"}
            </a>
          </div>
          <div className="landing-trust">
            <ShieldCheck size={20} />
            <span>
              {isAr
                ? "عزل المستأجرين · سجل تدقيق · جلسات محمية · هوية بن حمود"
                : "Tenant isolation · audit trail · protected sessions · BHD Identity"}
            </span>
          </div>
        </div>
        <div className="landing-hero-visual" aria-hidden={false}>
          <div className="landing-hero-glow" />
          <Image
            src="/marketing/hero-dashboard.jpg"
            alt={
              isAr
                ? "لقطة من لوحة تحكم المكتب القانوني"
                : "Legal office dashboard preview"
            }
            width={1600}
            height={900}
            priority
            className="landing-hero-shot"
          />
        </div>
      </section>

      <section className="landing-section" id="capabilities">
        <div className="landing-section-head">
          <h2>{isAr ? "كل ما يحتاجه المكتب" : "Everything the office needs"}</h2>
          <p>
            {isAr
              ? "من أول تسجيل دخول إلى إغلاق الجلسة — مساحة عمل واحدة."
              : "From first sign-in to closing the hearing—one workspace."}
          </p>
        </div>
        <div className="landing-features">
          {FEATURES.map((item) => {
            const Icon = item.icon;
            const copy = isAr ? item.ar : item.en;
            return (
              <article key={copy.title} className="landing-feature">
                <span className="landing-feature-icon">
                  <Icon size={22} />
                </span>
                <h3>{copy.title}</h3>
                <p>{copy.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="landing-section landing-inside" id="inside">
        <div className="landing-section-head">
          <h2>{isAr ? "من داخل النظام" : "Inside the product"}</h2>
          <p>
            {isAr
              ? "واجهات حقيقية لمساحة العمل — قضايا، جلسات، مالية، ووثائق."
              : "Real workspace views—matters, hearings, finance, and documents."}
          </p>
        </div>
        <div className="landing-gallery">
          {GALLERY.map((shot, index) => (
            <figure
              key={shot.src}
              className={`landing-shot ${index === 0 ? "is-wide" : ""}`}
            >
              <Image
                src={shot.src}
                alt={isAr ? shot.ar : shot.en}
                width={1600}
                height={900}
                sizes="(max-width: 900px) 100vw, 50vw"
              />
              <figcaption>{isAr ? shot.ar : shot.en}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="landing-section landing-close">
        <div className="landing-close-panel">
          <h2>
            {isAr
              ? "جاهز لمكتبك في مسقط وخارجها"
              : "Ready for offices in Muscat and beyond"}
          </h2>
          <p>
            {isAr
              ? "ادخل الآن، أنشئ مكتبك، وادعُ فريقك بأدوار واضحة."
              : "Sign in, create your office, and invite your team with clear roles."}
          </p>
          <Link className="primary landing-cta-main" href="/app" prefetch>
            {isAr ? "الانتقال إلى الدخول" : "Go to sign-in"}
            <ArrowUpLeft size={18} />
          </Link>
        </div>
      </section>

      <BhdSiteFooter locale={locale} />
    </div>
  );
}
