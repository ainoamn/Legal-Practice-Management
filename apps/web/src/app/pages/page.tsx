import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function Pages() {
  const response = await fetch(
    `${process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4311"}/api/v1/public/pages`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("Unable to load published pages");
  const pages = (await response.json()) as { slug: string; title: string }[];
  return (
    <main className="published-page">
      <Link href="/">LEGAL OFFICE AI</Link>
      <h1>صفحات المنصة / Platform pages</h1>
      {pages.length ? (
        <div className="roles-grid">
          {pages.map((page) => (
            <Link
              className="panel"
              href={`/pages/${page.slug}`}
              key={page.slug}
            >
              {page.title}
            </Link>
          ))}
        </div>
      ) : (
        <p>لا توجد صفحات منشورة بعد. / No pages published yet.</p>
      )}
    </main>
  );
}
