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
  const [query, setQuery] = useState("");

  const filtered = OMAN_LAWS.filter((law) => {
    if (category !== "all" && (isAr ? law.categoryAr : law.categoryEn) !== category) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${law.titleAr} ${law.titleEn} ${law.decree} ${law.summaryAr} ${law.summaryEn} ${law.categoryAr}`
      .toLowerCase()
      .includes(needle);
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
            ? "النصوص الكاملة منقولة من النسخ المنشورة على qanoon.om عن الجريدة الرسمية، مع ذكر مرسوم الإصدار وآخر تعديل ظاهر في المصدر. للاعتماد القضائي راجع الجريدة الرسمية."
            : "Full texts are taken from the consolidated pages on qanoon.om, which republish the Official Gazette, with the issuing decree and the latest amendment shown on that source. For judicial use, consult the Official Gazette."}
        </div>
        <input
          className="laws-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={isAr ? "ابحث عن قانون أو مرسوم" : "Search a law or decree"}
          aria-label={isAr ? "بحث في المكتبة" : "Search the library"}
        />
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

      {filtered.length === 0 ? (
        <p className="laws-empty">{isAr ? "لا توجد نتيجة لهذا البحث." : "No law matches this search."}</p>
      ) : null}
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
              {" · "}
              {isAr ? `${law.articleCount} مادة` : `${law.articleCount} articles`}
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
