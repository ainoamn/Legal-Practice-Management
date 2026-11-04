import Link from "next/link";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function PublishedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const response = await fetch(
    `${process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4311"}/api/v1/public/pages/${encodeURIComponent(slug)}`,
    { cache: "no-store" },
  );
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("Unable to load published page");
  const page = (await response.json()) as { title: string; body: string };
  return (
    <main className="published-page">
      <Link href="/pages">LEGAL OFFICE AI · الصفحات / Pages</Link>
      <article className="panel" dir="auto">
        <h1>{page.title}</h1>
        <div className="published-body">{page.body}</div>
      </article>
    </main>
  );
}
