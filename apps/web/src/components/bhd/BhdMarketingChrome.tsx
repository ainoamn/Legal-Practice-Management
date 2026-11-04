"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { hopOrigins, launchUrlForApp, type BhdApp } from "../../lib/bhd/apps";
import { getCachedCatalogApps } from "../../lib/bhd/catalog";
import { useBhdCatalog } from "../../lib/identity/use-bhd-catalog";
import { BhdAppIcon } from "./BhdAppIcon";
import { BhdAppSwitcher, type BhdSwitcherUser } from "./BhdAppSwitcher";
import "../../bhd-switcher.css";

type Locale = "ar" | "en";

const SSO_START = "/api/auth/bhd/start?returnTo=%2Fapp";

function isCurrentApp(app: BhdApp, pageOrigin: string) {
  const here = pageOrigin.replace(/\/$/, "");
  if (app.id === "legal") {
    return (
      here === "https://legal-office-web.vercel.app" ||
      here.includes("legal-office") ||
      /^https?:\/\/(localhost|127\.0\.0\.1):4310$/.test(here)
    );
  }
  return Boolean(app.origin) && here === app.origin.replace(/\/$/, "");
}

export function BhdMarketingChrome({
  locale,
  onLocaleChange,
  brand,
  brandHref = "/",
  brandMark,
}: {
  locale: Locale;
  onLocaleChange: (next: Locale) => void;
  brand: React.ReactNode;
  brandHref?: string;
  brandMark?: React.ReactNode;
}) {
  const isAr = locale === "ar";
  const catalog = useBhdCatalog();
  const [origin, setOrigin] = useState("");
  const [appsOpen, setAppsOpen] = useState(false);
  const [user, setUser] = useState<BhdSwitcherUser | null>(null);
  const [ready, setReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const appsId = useId();

  useEffect(() => {
    setOrigin(window.location.origin);
    hopOrigins(getCachedCatalogApps()).forEach((item) => {
      if (document.head.querySelector(`link[data-bhd-hop="${item}"]`)) return;
      const pre = document.createElement("link");
      pre.rel = "preconnect";
      pre.href = item;
      pre.setAttribute("data-bhd-hop", item);
      document.head.appendChild(pre);
    });
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/v1/auth/me", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!live) return;
        if (!response.ok) {
          setUser(null);
          setReady(true);
          return;
        }
        const me = (await response.json()) as {
          user?: { fullName?: string; email?: string; id?: string };
        };
        if (me.user?.email) {
          setUser({
            id: me.user.id,
            name: me.user.fullName || me.user.email,
            email: me.user.email,
            picture: null,
            hasPassword: true,
          });
        } else setUser(null);
        setReady(true);
      })
      .catch(() => {
        if (live) {
          setUser(null);
          setReady(true);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!appsOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setAppsOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setAppsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [appsOpen]);

  const signOut = useCallback(() => {
    window.location.assign("/api/auth/bhd/logout");
  }, []);
  const signOutAll = useCallback(() => {
    window.location.assign("/api/auth/bhd/logout?all=1");
  }, []);

  return (
    <header className="bhd-chrome">
      <Link href={brandHref} className="bhd-chrome-brand" prefetch>
        {brandMark}
        {brand}
      </Link>

      <div className="bhd-chrome-actions" ref={rootRef}>
        <button
          type="button"
          className="bhd-chrome-lang"
          onClick={() => onLocaleChange(isAr ? "en" : "ar")}
          aria-label={isAr ? "English" : "العربية"}
        >
          <Globe size={16} />
          <span>{isAr ? "EN" : "ع"}</span>
        </button>

        {ready && user ? (
          <BhdAppSwitcher
            user={user}
            onSignOut={signOut}
            onSignOutAll={signOutAll}
            locale={locale}
          />
        ) : (
          <>
            <div className="bhd-switcher-slot">
              <button
                type="button"
                className="bhd-switcher-grid"
                aria-label={isAr ? "تطبيقات BHD" : "BHD apps"}
                aria-haspopup="dialog"
                aria-expanded={appsOpen}
                aria-controls={appsOpen ? appsId : undefined}
                onClick={() => setAppsOpen((open) => !open)}
              >
                <span aria-hidden="true">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <i key={index} />
                  ))}
                </span>
              </button>
              {appsOpen ? (
                <div
                  className="bhd-switcher-card"
                  id={appsId}
                  role="dialog"
                  aria-label={isAr ? "تطبيقات BHD" : "BHD apps"}
                >
                  <div className="bhd-switcher-card-head">
                    <p>{isAr ? "تطبيقات BHD" : "BHD apps"}</p>
                  </div>
                  <div className="bhd-switcher-grid-apps">
                    {catalog.map((app) => {
                      const current = origin
                        ? isCurrentApp(app, origin)
                        : false;
                      const label = isAr ? app.nameAr : app.nameEn;
                      return (
                        <button
                          key={app.id}
                          type="button"
                          className={
                            app.enabled
                              ? "bhd-switcher-app"
                              : "bhd-switcher-app is-disabled"
                          }
                          disabled={!app.enabled}
                          aria-current={current ? "page" : undefined}
                          onClick={() => {
                            if (!app.enabled) return;
                            if (current) {
                              setAppsOpen(false);
                              return;
                            }
                            const url =
                              app.mode === "identity"
                                ? `${app.origin.replace(/\/$/, "")}${app.workspacePath}`
                                : launchUrlForApp(app, origin);
                            window.location.assign(url);
                          }}
                        >
                          <BhdAppIcon
                            id={app.id}
                            title={label}
                            logoUrl={app.logoUrl}
                            soft={app.soft}
                            accent={app.accent}
                            className={
                              current
                                ? "bhd-switcher-mark is-current"
                                : "bhd-switcher-mark"
                            }
                          />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <a className="bhd-chrome-signin" href={SSO_START}>
              {isAr ? "تسجيل الدخول" : "Sign in"}
            </a>
            <a className="bhd-chrome-cta" href={SSO_START}>
              {isAr ? "ابدأ بحساب بن حمود" : "Start with Bin Hamood"}
            </a>
          </>
        )}
      </div>
    </header>
  );
}

export { SSO_START };
