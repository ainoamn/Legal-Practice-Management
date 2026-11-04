"use client";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { ar, en } from "../lib/messages";
export function MfaPanel({
  locale,
  onChange,
}: {
  locale: "ar" | "en";
  onChange: () => Promise<void>;
}) {
  const t = locale === "ar" ? ar : en;
  const [status, setStatus] = useState<{
      enabled: boolean;
      configured: boolean;
    } | null>(null),
    [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null),
    [codes, setCodes] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(false);
  useEffect(() => {
    let live = true;
    api<{ enabled: boolean; configured: boolean }>("auth/mfa")
      .then((value) => {
        if (live) setStatus(value);
      })
      .catch((err) => {
        if (live)
          setError(err instanceof ApiError ? err.code : "INTERNAL_ERROR");
      });
    return () => {
      live = false;
    };
  }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice(false);
    try {
      await work();
      setStatus(await api("auth/mfa"));
      await onChange();
      setNotice(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "INTERNAL_ERROR");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel mfa-panel">
      <h3>
        <ShieldCheck size={20} />
        {t.mfaTitle}
      </h3>
      <p className="muted small-text">{t.mfaDescription}</p>
      {error && (
        <div role="alert" className="alert error">
          {t.errors[error as keyof typeof t.errors] ?? t.failed}
        </div>
      )}
      {notice && (
        <p role="status" className="alert success">
          {t.saved}
        </p>
      )}
      {!status ? (
        <p>{t.loading}</p>
      ) : (
        <>
          <span className={`badge ${status.enabled ? "green" : "gray"}`}>
            {status.enabled ? t.mfaEnabled : t.mfaDisabled}
          </span>
          {!status.configured && (
            <p className="muted small-text">{t.mfaNeedsKey}</p>
          )}
          {codes.length > 0 && (
            <div className="recovery-box">
              <strong>{t.mfaRecoveryTitle}</strong>
              <p>{t.mfaRecoveryHelp}</p>
              <div className="recovery-codes" dir="ltr">
                {codes.map((code) => (
                  <code key={code}>{code}</code>
                ))}
              </div>
              <button className="secondary" onClick={() => setCodes([])}>
                {t.mfaCodesSaved}
              </button>
            </div>
          )}
          {!status.enabled && status.configured && !setup && (
            <form
              className="mfa-form"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void run(async () =>
                  setSetup(
                    await api("auth/mfa/setup", "POST", {
                      password: data.get("password"),
                    }),
                  ),
                );
              }}
            >
              <label className="field">
                <span>{t.currentPassword}</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy ? t.wait : t.mfaSetup}
              </button>
            </form>
          )}
          {setup && !status.enabled && (
            <form
              className="mfa-form"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void run(async () => {
                  const response = await api<{ recoveryCodes: string[] }>(
                    "auth/mfa/confirm",
                    "POST",
                    { code: data.get("code") },
                  );
                  setCodes(response.recoveryCodes);
                  setSetup(null);
                });
              }}
            >
              <label className="field">
                <span>{t.mfaSecret}</span>
                <input dir="ltr" value={setup.secret} readOnly />
                <small>{t.mfaSecretHelp}</small>
              </label>
              <details>
                <summary>{t.mfaProvisioning}</summary>
                <code className="break-text" dir="ltr">
                  {setup.uri}
                </code>
              </details>
              <label className="field">
                <span>{t.mfaCode}</span>
                <input
                  name="code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  dir="ltr"
                  required
                  pattern="[0-9]{6}"
                  maxLength={6}
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy ? t.wait : t.mfaEnable}
              </button>
            </form>
          )}
          {status.enabled && (
            <form
              className="mfa-form"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                if (!window.confirm(t.mfaDisableWarning)) return;
                void run(async () => {
                  await api("auth/mfa/disable", "POST", {
                    password: data.get("password"),
                    factor: data.get("factor"),
                  });
                  setCodes([]);
                });
              }}
            >
              <label className="field">
                <span>{t.currentPassword}</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                />
              </label>
              <label className="field">
                <span>{t.mfaCode}</span>
                <input
                  name="factor"
                  dir="ltr"
                  autoComplete="one-time-code"
                  required
                  pattern="([0-9]{6}|[a-fA-F0-9]{16})"
                />
              </label>
              <button className="secondary" disabled={busy}>
                {busy ? t.wait : t.mfaDisable}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
