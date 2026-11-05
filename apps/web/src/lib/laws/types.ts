export type LawArticle = {
  number: string;
  title?: string;
  body: string;
};

export type LawChapter = {
  title: string;
  articles: LawArticle[];
};

export type OmanLaw = {
  slug: string;
  titleAr: string;
  titleEn: string;
  decree: string;
  year: number;
  categoryAr: string;
  categoryEn: string;
  summaryAr: string;
  summaryEn: string;
  sourceUrl: string;
  sourceNoteAr?: string;
  sourceNoteEn?: string;
  /** أحدث تعديل تشير إليه صفحة النص المجمّع. */
  amendedThrough?: string;
  chapters: LawChapter[];
};

export type LawCatalogItem = Omit<OmanLaw, "chapters"> & {
  articleCount: number;
};

export type LawPage = {
  index: number;
  chapterTitle?: string;
  articles: LawArticle[];
};
