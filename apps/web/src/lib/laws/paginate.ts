import type { LawArticle, LawPage, OmanLaw } from "./types";

/** يجمّع المواد في صفحات قراءة بحجم مناسب لصفحة كتاب. */
export function paginateLaw(law: OmanLaw, charsPerPage = 1100): LawPage[] {
  const pages: LawPage[] = [];
  let bucket: LawArticle[] = [];
  let chapterTitle: string | undefined;
  let used = 0;

  const flush = () => {
    if (!bucket.length) return;
    pages.push({
      index: pages.length + 1,
      chapterTitle,
      articles: bucket,
    });
    bucket = [];
    used = 0;
    chapterTitle = undefined;
  };

  for (const chapter of law.chapters) {
    for (const article of chapter.articles) {
      const weight =
        article.body.length + (article.title?.length ?? 0) + article.number.length + 40;
      if (bucket.length && used + weight > charsPerPage) flush();
      if (!bucket.length) chapterTitle = chapter.title;
      bucket.push(article);
      used += weight;
      if (used >= charsPerPage) flush();
    }
  }
  flush();
  return pages;
}
