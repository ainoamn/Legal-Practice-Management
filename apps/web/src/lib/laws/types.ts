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
  chapters: LawChapter[];
};

export type LawPage = {
  index: number;
  chapterTitle?: string;
  articles: LawArticle[];
};
