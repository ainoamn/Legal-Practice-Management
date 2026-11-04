"use client";
import { useState, useEffect } from "react";
import { api, ApiError } from "../lib/api";
import { ar, en } from "../lib/messages";
export function PasswordRecovery({
  locale,
  onBack,
}: {
  locale: "ar" | "en";
  onBack: () => void;
}) {
  const t = locale === "ar" ? ar : en;
  const [token] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.hash.slice(1)).get("reset") ?? ""),
  );
  const [configured, setConfigured] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  useEffect(() => {
    if (token) {
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }
    let live = true;
    api<{ passwordRecovery: boolean }>("auth/capabilities")
      .then((value) => {
        if (live) setConfigured(value.passwordRecovery);
      })
      .catch((err) => {
        if (live)
          setError(err instanceof ApiError ? err.code : "INTERNAL_ERROR");
      });
    return () => {
      live = false;
    };
  }, [token]);
  return (
    <>
      <h2>{token ? t.resetPassword : t.forgotPassword}</h2>
      <p className="muted small-text">
        {token ? t.passwordHelp : t.recoveryDescription}
      </p>
      {error && (
        <div className="alert error" role="alert">
          {t.errors[error as keyof typeof t.errors] ?? t.failed}
        </div>
      )}
      {done && (
        <p className="alert success" role="status">
          {token ? t.passwordResetDone : t.recoverySent}
        </p>
      )}
      {!token && !configured && (
        <p className="alert" role="status">
          {t.recoveryDisabled}
        </p>
      )}
      {!(token && done) && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              if (token) {
                if (data.get("password") !== data.get("confirmPassword")) {
                  setError("PASSWORD_MISMATCH");
                  return;
                }
                await api("auth/password/reset", "POST", {
                  token,
                  password: data.get("password"),
                });
              } else {
                await api("auth/password/forgot", "POST", {
                  email: data.get("email"),
                  slug: data.get("slug"),
                });
              }
              setDone(true);
            } catch (err) {
              setError(err instanceof ApiError ? err.code : "INTERNAL_ERROR");
            } finally {
              setBusy(false);
            }
          }}
        >
          {token ? (
            <>
              <label className="field">
                <span>{t.newPassword}</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  dir="ltr"
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
              <label className="field">
                <span>{t.confirmPassword}</span>
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  dir="ltr"
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
            </>
          ) : (
            <>
              <label className="field">
                <span>{t.email}</span>
                <input
                  name="email"
                  type="email"
                  dir="ltr"
                  autoComplete="username"
                  required
                />
              </label>
              <label className="field">
                <span>{t.slug}</span>
                <input
                  name="slug"
                  dir="ltr"
                  required
                  minLength={3}
                  maxLength={60}
                />
              </label>
            </>
          )}
          <button
            className="primary full"
            disabled={busy || (!token && !configured)}
          >
            {busy ? t.wait : token ? t.resetPassword : t.sendRecovery}
          </button>
        </form>
      )}
      <button className="secondary full" onClick={onBack}>
        {t.returnLogin}
      </button>
    </>
  );
}
