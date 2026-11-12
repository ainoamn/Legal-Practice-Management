# كروم مشغّل تطبيقات BHD (أسلوب خمسات/حسوب)

> **المرجع البصري/الأنماط المشتركة:** [https://id.bhd-om.com/bhd-launcher.css](https://id.bhd-om.com/bhd-launcher.css)  
> **مصدر المكوّن React:** ONE-BHD — `BhdAppSwitcher.tsx` (الصورة ثم الشبكة، استبعاد `account` من البلاطات، `googleAvatarSrc`).

## القواعد

1. بعد الدخول: **صورة جوجل الدائرية أولاً**، ثم زر شبكة التطبيقات (تسع نقاط).
2. لوحة التطبيقات: شبكة **3 أعمدة**؛ لا تُدرج بلاطة `account` (الحساب من الأفاتار فقط).
3. روابط `googleusercontent.com` تُعاد كتابتها إلى `s96-c`؛ الصورة `referrerPolicy="no-referrer"` و`object-fit: cover` بدائرة 32px.
4. يمكن للمنتجات الاعتماد على أنماط الهوية عبر الرابط أعلاه دون نسخ أصول `public` محلياً.
