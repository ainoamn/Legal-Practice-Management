"use client";

import {
  applyAccountIsolation,
  clearAccountRebindLock,
  isAccountRebindPending,
  isIdentityOrigin,
  scrubCacheBustFromUrl,
  tabMayClaimProductCookie,
} from "@/lib/identity/client";
import { loadBhdIdentity } from "@/lib/identity/bhd-browser";
import {
  boundWindowToken,
  captureAccountToken,
  readActiveAu,
  setActiveAu,
} from "@/lib/identity/window-session";
import { useEffect, useState } from "react";

export function BhdPrivacyGate() {
  const [productSub, setProductSub] = useState<string | null>(null);
  const [productEmail, setProductEmail] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetch("/api/auth/me", { cache: "no-store", credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { user?: { id?: string; email?: string } | null } | null) => {
        if (!live || !payload?.user) return;
        if (payload.user.id) setProductSub(payload.user.id);
        if (payload.user.email) setProductEmail(payload.user.email);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    if (
      isIdentityOrigin() ||
      path.startsWith("/login") ||
      path.startsWith("/oauth") ||
      path.startsWith("/api/") ||
      path.startsWith("/auth/") ||
      path.startsWith("/callback")
    ) {
      clearAccountRebindLock();
      return;
    }

    let cancelled = false;

    async function gate() {
      if (cancelled) return;
      try {
        const au = readActiveAu();
        if (au) setActiveAu(au);

        if (productSub && (!au || productSub === au)) {
          setActiveAu(productSub);
          clearAccountRebindLock();
          scrubCacheBustFromUrl();
          return;
        }

        if (isAccountRebindPending()) {
          if (productSub && au && productSub === au) {
            clearAccountRebindLock();
            scrubCacheBustFromUrl();
          }
          return;
        }

        const identity = await loadBhdIdentity();
        if (cancelled || !identity) {
          if (productSub) {
            clearAccountRebindLock();
            scrubCacheBustFromUrl();
          }
          return;
        }

        const { ok, body } = await identity.me();
        if (cancelled) return;
        if (!ok || !body.user?.id) {
          clearAccountRebindLock();
          scrubCacheBustFromUrl();
          return;
        }

        const identityId = body.user.id;
        const identityEmail = (body.user.email || "").trim().toLowerCase();
        const localEmail = (productEmail || "").trim().toLowerCase();
        if (typeof body.token === "string") captureAccountToken(identityId, body.token);
        if (!au) setActiveAu(identityId);

        const targetAu = readActiveAu() || identityId;
        const matched =
          Boolean(productSub) &&
          productSub === identityId &&
          productSub === targetAu &&
          (!localEmail || !identityEmail || localEmail === identityEmail);

        if (matched) {
          clearAccountRebindLock();
          scrubCacheBustFromUrl();
          return;
        }

        const token = boundWindowToken() || (typeof body.token === "string" ? body.token : "");
        if (!tabMayClaimProductCookie()) return;

        await applyAccountIsolation(token, { force: true, sub: targetAu || identityId, silent: true });
      } catch {
        clearAccountRebindLock();
      }
    }

    void gate();
    return () => {
      cancelled = true;
    };
  }, [productEmail, productSub]);

  return null;
}
