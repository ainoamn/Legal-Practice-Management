"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Printer,
  Scale,
  ArrowRight,
} from "lucide-react";
import type { OmanLaw } from "../../lib/laws/types";
import { paginateLaw } from "../../lib/laws/paginate";

export function LawReader({ law }: { law: OmanLaw }) {
  const [locale, setLocale] = useState<"ar" | "en">("ar");
  const [page, setPage] = useState(1);
  const isAr = locale === "ar";
  const pages = useMemo(() => paginateLaw(law), [law]);
  const total = pages.length;
  const current = pages[Math.min(Math.max(page, 1), total) - 1]!;

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  useEffect(() => {
    setPage(1);
  }, [law.slug]);

  const printedAt = useMemo(
    () =>
      new Intl.DateTimeFormat(isAr ? "ar-OM" : "en-GB", {
        dateStyle: "long",
        timeZone: "Asia/Muscat",
      }).format(new Date()),
    [isAr],
  );

  function go(next: number) {
    setPage(Math.min(Math.max(next, 1), total));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function printPage() {
    window.print();
  }

  return (
    <div className="law-reader" dir={isAr ? "rtl" : "ltr"} lang={locale}>
      <div className="law-reader-toolbar no-print-page">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/laws">
            <ArrowRight size={16} />
            {isAr ? "المكتبة" : "Library"}
          </Link>
          <button type="button" onClick={() => setLocale(isAr ? "en" : "ar")}>
            {isAr ? "EN" : "ع"}
          </button>
        </div>
        <strong style={{ fontSize: "0.92rem" }}>
          {isAr ? law.titleAr : law.titleEn}
        </strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="is-primary" onClick={printPage}>
            <Printer size={16} />
            {isAr ? "طباعة الصفحة" : "Print page"}
          </button>
        </div>
      </div>

      <div className="law-reader-stage print-only-current">
        <article className="law-letter" aria-label={isAr ? law.titleAr : law.titleEn}>
          <div className="law-letter-flag" aria-hidden />
          <header className="law-letterhead">
            <span className="law-letterhead-mark" aria-hidden>
              <Scale size={24} />
            </span>
            <div className="law-letterhead-brand">
              <strong>LEGAL OFFICE AI</strong>
              <span>
                {isAr
                  ? "منصة بن حمود · مساحة المكتب القانوني · سلطنة عُمان"
                  : "Bin Hamood · Legal practice workspace · Sultanate of Oman"}
              </span>
            </div>
            <div className="law-letterhead-meta">
              <div>{isAr ? "نسخة مرجعية مكتبية" : "Office reference copy"}</div>
              <div>
                {isAr ? "تاريخ الطباعة" : "Printed"}: {printedAt}
              </div>
              <div>
                {isAr ? "مسقط — Asia/Muscat" : "Muscat — Asia/Muscat"}
              </div>
            </div>
          </header>

          <div className="law-letter-title">
            <h1>{isAr ? law.titleAr : law.titleEn}</h1>
            <p>{law.decree}</p>
            {law.amendedThrough ? (
              <p className="law-source">
                {isAr ? `معدل لغاية ${law.amendedThrough}` : `Amended through ${law.amendedThrough}`}
              </p>
            ) : null}
            {law.sourceNoteAr ? (
              <p className="law-source">{isAr ? law.sourceNoteAr : law.sourceNoteEn}</p>
            ) : null}
            <p className="law-source">
              {isAr
                ? "النص كما نُشر في المصدر. للاعتماد القضائي راجع الجريدة الرسمية."
                : "Text as published at the source. For judicial use, consult the Official Gazette."}
            </p>
          </div>

          <div className="law-letter-body">
            {current.chapterTitle ? (
              <p className="law-chapter-label">{current.chapterTitle}</p>
            ) : null}
            {current.articles.map((article, articleIndex) => (
              <section key={`${current.index}-${articleIndex}`} className="law-article">
                <div className="law-article-head">
                  <span className="law-article-num">
                    {article.number === "ديباجة"
                      ? isAr
                        ? "ديباجة"
                        : "Preamble"
                      : article.number === "حاشية"
                        ? isAr
                          ? "حاشية المصدر"
                          : "Source notes"
                        : isAr
                          ? `المادة (${article.number})`
                          : `Article (${article.number})`}
                  </span>
                  {article.title ? (
                    <h2 className="law-article-title">{article.title}</h2>
                  ) : null}
                </div>
                <p>{article.body}</p>
              </section>
            ))}
          </div>

          <footer className="law-letter-footer">
            <span>{law.sourceUrl}</span>
            <span>
              {isAr ? "صفحة" : "Page"} {current.index} / {total}
            </span>
          </footer>
        </article>
      </div>

      <nav className="law-pager no-print-page" aria-label={isAr ? "تصفح الصفحات" : "Page navigation"}>
        <button type="button" disabled={page <= 1} onClick={() => go(page - 1)}>
          {isAr ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {isAr ? "السابق" : "Previous"}
        </button>
        <span>
          {isAr ? "صفحة" : "Page"} {page} / {total}
        </span>
        <button type="button" disabled={page >= total} onClick={() => go(page + 1)}>
          {isAr ? "التالي" : "Next"}
          {isAr ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </nav>
    </div>
  );
}
