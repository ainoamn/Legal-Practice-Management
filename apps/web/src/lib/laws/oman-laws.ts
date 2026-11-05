import type { LawCatalogItem } from "./types";
import catalog from "./catalog.json";

/** فهرس المكتبة بلا نصوص المواد. النص الكامل يُحمَّل في صفحة القانون. */
export const OMAN_LAWS = catalog as LawCatalogItem[];

export function getLawMeta(slug: string) {
  return OMAN_LAWS.find((law) => law.slug === slug) ?? null;
}
