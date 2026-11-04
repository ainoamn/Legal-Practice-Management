"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpLeft, BookOpen, Scale } from "lucide-react";
import { OMAN_LAWS } from "../../lib/laws/oman-laws";

export function LawsLibrary() {
  const [locale, setLocale] = useState<"ar" | "en">("ar");
  const isAr = locale === "ar";

  const categories = useMemo(() => {
    const key = isAr ? "categoryAr" : "categoryEn";
    return ["all", ...new Set(OMAN_LAWS.map((law) => law[key]))];
  }, [isAr]);

  const [category, setCategory] = useState("all");

  const filtered = OMAN_LAWS.filter((law) => {
    if (category === "all") return true;
    return (isAr ? law.categoryAr : law.categoryEn) === category;
  });

  return (
    <div className="laws-shell" dir={isAr ? "rtl" : "ltr"} lang={locale}>
      <header className="laws-top">
        <Link href="/" className="laws-brand" prefetch>
          <span className="laws-brand-mark" aria-hidden>
            <Scale size={18} />
          </span>
          <span>
            <strong>LEGAL OFFICE AI</strong>
            <small>{isAr ? "مكتبة القوانين العمانية" : "Omani laws library"}</small>
          </span>
        </Link>
        <div className="laws-top-actions">
          <button
            type="button"
            className="laws-chip"
            onClick={() => setLocale(isAr ? "en" : "ar")}
          >
            {isAr ? "EN" : "ع"}
          </button>
          <Link className="laws-btn" href="/app" prefetch>
            {isAr ? "المكتب" : "Workspace"}
          </Link>
        </div>
      </header>

      <section className="laws-hero">
        <h1>{isAr ? "مكتبة القوانين واللوائح العمانية" : "Omani laws & regulations library"}</h1>
        <p>
          {isAr
            ? "استعرض كل قانون على حدة، واقرأه صفحة بصفحة بأسلوب كتاب رسمي يحمل شعار المنصة واسمها — مع إمكانية الطباعة."
            : "Browse each law on its own, read page by page like an official book with the platform letterhead—and print when needed."}
        </p>
        <div className="laws-note" role="note">
          {isAr
            ? "نسخة مرجعية مكتبية داخل LEGAL OFFICE AI مع ذكر المرسوم. للاعتماد القضائي الرسمي راجع الجريدة الرسمية لسلطنة عُمان وأحدث التعديلات."
            : "In-platform reference edition citing the Royal Decree. For official judicial use, consult Oman’s Official Gazette and latest amendments."}
        </div>
        <div className="laws-top-actions" style={{ marginTop: 16 }}>
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              className="laws-chip"
              style={
                category === item
                  ? { background: "#066266", color: "#fff", borderColor: "#066266" }
                  : undefined
              }
              onClick={() => setCategory(item)}
            >
              {item === "all" ? (isAr ? "الكل" : "All") : item}
            </button>
          ))}
        </div>
      </section>

      <div className="laws-grid">
        {filtered.map((law) => (
          <Link key={law.slug} href={`/laws/${law.slug}`} className="laws-card" prefetch>
            <span className="laws-card-cat">
              {isAr ? law.categoryAr : law.categoryEn}
            </span>
            <h2>{isAr ? law.titleAr : law.titleEn}</h2>
            <p>{isAr ? law.summaryAr : law.summaryEn}</p>
            <span className="laws-card-meta">
              <BookOpen size={14} style={{ display: "inline", marginInlineEnd: 6 }} />
              {law.decree}
            </span>
            <span className="laws-btn laws-btn-primary" style={{ alignSelf: "flex-start" }}>
              {isAr ? "افتح للقراءة" : "Open to read"}
              <ArrowUpLeft size={16} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
