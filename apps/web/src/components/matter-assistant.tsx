"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

export function MatterAssistant({
  locale,
  matterId,
}: {
  locale: "ar" | "en";
  matterId: string;
}) {
  const ar = locale === "ar";
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ enabled: boolean; remaining: number }>("ai/status")
      .then((row) => {
        setEnabled(row.enabled);
        setRemaining(row.remaining);
      })
      .catch(() => setEnabled(false));
  }, [matterId]);

  return (
    <article className="panel">
      <h3>{ar ? "المساعد من ملفات القضية" : "Assistant from the case files"}</h3>
      <p className="muted">
        {ar
          ? "الإجابة تُقبل فقط إذا استندت إلى نص مستخرج من مستند جاهز في هذه القضية. بلا مفتاح مزود تبقى الخدمة متوقفة، ولا تُعرض إجابة مخترعة."
          : "An answer is accepted only when it cites text extracted from a ready document in this matter. Without a provider key the service stays off, and no invented answer is shown."}
      </p>
      {enabled === false && (
        <p>{ar ? "الذكاء الاصطناعي غير مفعّل على هذا الخادم." : "AI is not enabled on this server."}</p>
      )}
      {remaining !== null && (
        <p>
          {ar ? "المتبقي من حصة الباقة:" : "Remaining plan allowance:"} {remaining}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setAnswer("");
          setNotice("");
          void api<{ ok: boolean; reason: string | null; answer?: string; citations?: string[] }>(
            "ai/ask",
            "POST",
            { matterId, question },
          )
            .then((row) => {
              if (row.ok && row.answer) setAnswer(row.answer);
              else
                setNotice(
                  ar
                    ? "لم تُقبل الإجابة لأنها لا تذكر مصدراً من ملفات القضية."
                    : "The answer was refused because it did not cite a case-file source.",
                );
            })
            .catch((error: unknown) => {
              const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
              setNotice(
                code === "AI_DISABLED"
                  ? ar
                    ? "الذكاء الاصطناعي غير مفعّل."
                    : "AI is not enabled."
                  : code === "NO_SOURCE_TEXT"
                    ? ar
                      ? "لا يوجد نص مستخرج جاهز في مستندات هذه القضية."
                      : "This matter has no ready extracted text."
                    : code === "AI_QUOTA"
                      ? ar
                        ? "استُهلكت حصة الذكاء الاصطناعي في الباقة."
                        : "The plan AI allowance is used up."
                      : code,
              );
            })
            .finally(() => setBusy(false));
        }}
      >
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          minLength={3}
          maxLength={2000}
          required
          rows={4}
          placeholder={ar ? "سؤال عن المستندات المرفوعة" : "A question about the uploaded documents"}
        />
        <button className="primary" disabled={busy || enabled === false}>
          {busy ? (ar ? "جارٍ المراجعة" : "Reviewing") : ar ? "اسأل الملفات" : "Ask the files"}
        </button>
      </form>
      {answer && <p className="practice-prose">{answer}</p>}
      {notice && <p>{notice}</p>}
    </article>
  );
}
