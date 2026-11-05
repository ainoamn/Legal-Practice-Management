export type SourceExcerpt = { id: string; title: string; excerpt: string };

/** An answer is usable only when it cites at least one supplied source id. */
export function citedAnswer(text: string, sources: SourceExcerpt[]) {
  const citations = sources
    .map((source) => source.id)
    .filter((id) => text.includes(id));
  if (!citations.length) return null;
  return { answer: text.trim(), citations };
}
