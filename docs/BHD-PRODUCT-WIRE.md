# ربط Legal Practice Management بهوية BHD الحية

> **تاريخ:** 12 نوفمبر 2026  
> **المستودع:** https://github.com/ainoamn/Legal-Practice-Management  
> **المنتج:** `@legal/web` — `https://legal.bhd-om.com`  
> **الهوية:** https://id.bhd-om.com — **الأيقونات:** `/admin#apps` — **الربط:** `/admin#connect`  
> **client_id:** `bhd-legal`

## ما أُضيف / يُعتمد

| البند | الموقع |
|---|---|
| سكربت الهوية | `apps/web/src/app/layout.tsx` → `https://id.bhd-om.com/bhd-identity.js` |
| عزل الحسابات | `BhdAccountIsolation` → `BhdSilentSso` + `BhdPrivacyGate` |
| CSP | `apps/web/next.config.ts` → `id.bhd-om.com` في script/connect/frame |
| كتالوج حي | `apps/web/src/lib/bhd/catalog.ts` + شريط `BhdProgramsStrip` (رأس + فوتر «برامج BHD») |
| OAuth start/callback | `apps/web/src/app/api/auth/bhd/{start,callback}` |
| logout / rebind | rewrite → `@legal/api` (`/api/v1/auth/bhd/*`) مع دعم window-token لـ silent SSO |
| `/api/auth/me` | `apps/web` يُعيد `user.id` = `bhdSub` لعزل التبديل |
| مساعدات الهوية | `apps/web/src/lib/bhd/*`, `lib/identity/*`, `lib/auth/session.ts` |

## متغيرات البيئة (لا تُرفع أسراراً)

```env
BHD_IDENTITY_ISSUER=https://id.bhd-om.com
BHD_OAUTH_CLIENT_ID=bhd-legal
BHD_OAUTH_CLIENT_SECRET=
WEB_ORIGIN=https://legal.bhd-om.com
# BHD_OAUTH_REDIRECT_URI=https://legal.bhd-om.com/api/auth/bhd/callback
AUTH_SECRET=
INTERNAL_API_URL=
```

سجّل في `/admin#connect`:

- client: `bhd-legal`
- origin: `https://legal.bhd-om.com`
- redirect: `https://legal.bhd-om.com/api/auth/bhd/callback`

## تحقق

1. `/admin#apps` → بلاطات تظهر في شريط «برامج BHD» (رأس + فوتر) خلال ثوانٍ.
2. حسابان → تبديل من نافذة الهوية → `POST /api/auth/bhd/rebind` يكتب `legal_session` للحساب الجديد.
3. `GET /api/auth/bhd/logout` يمسح الجلسة ويكمل end-session على الهوية.

## مراجع

- `BHD-CURSOR-PRODUCT-WIRE.md` — أمر الوكيل  
- `BHD-IDENTITY-RUNTIME.md` — runtime + سكربت  
- `BHD-ACCOUNT-ISOLATION.md` / سياسة الجلسة في المستودع  
