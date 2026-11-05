import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LawReader } from "../../../components/laws/LawReader";
import { getLawBySlug } from "../../../lib/laws/load-law";
import { OMAN_LAWS } from "../../../lib/laws/oman-laws";
import "../laws.css";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return OMAN_LAWS.map((law) => ({ slug: law.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const law = getLawBySlug(slug);
  if (!law) return { title: "قانون غير موجود | LEGAL OFFICE AI" };
  return {
    title: `${law.titleAr} | LEGAL OFFICE AI`,
    description: `${law.decree} — ${law.summaryAr}`,
  };
}

export default async function LawReaderPage({ params }: Props) {
  const { slug } = await params;
  const law = getLawBySlug(slug);
  if (!law) notFound();
  return <LawReader law={law} />;
}
