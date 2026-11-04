import { test, expect } from "@playwright/test";
import { totp } from "../../apps/api/src/auth/totp.js";
import { randomBytes, createHash } from "node:crypto";
import { db } from "../../packages/database/src/index.js";
test.afterAll(async () => db.$disconnect());
test("Arabic registration, persisted team, permissions, English and logout", async ({
  page,
}) => {
  const id = `e2e-${Date.now()}`,
    password = "E2E-Secure-Password-2026";
  await page.goto("/");
  await page.getByRole("button", { name: "إنشاء مكتب", exact: true }).click();
  await page.getByLabel("الاسم الكامل").fill("مالك الاختبار");
  await page.getByLabel("اسم المكتب", { exact: true }).fill("مكتب الاختبار");
  await page.getByLabel("معرّف المكتب", { exact: false }).fill(id);
  await page.getByLabel("البريد الإلكتروني").fill(`${id}@tests.invalid`);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "إنشاء مساحة العمل" }).click();
  await expect(page.getByRole("heading", { name: /أهلاً بك/ })).toBeVisible();
  await expect(
    page.getByText("بيانات مباشرة من مساحة مكتبك").first(),
  ).toBeVisible();
  await expect(page.locator(".stat-card").first().locator("strong")).toHaveText(
    "1",
  );
  await page.screenshot({ path: ".local/qa/overview-ar.png", fullPage: true });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "فريق المكتب" })
    .click();
  await page.getByRole("button", { name: "إضافة عضو" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("الاسم الكامل").fill("محاسب الاختبار");
  await dialog
    .getByLabel("البريد الإلكتروني")
    .fill(`${id}-accountant@tests.invalid`);
  await dialog.getByLabel("كلمة المرور").fill(password);
  await dialog
    .getByLabel("الدور", { exact: true })
    .selectOption({ label: "محاسب" });
  await dialog.getByRole("button", { name: "حفظ التغييرات" }).click();
  await expect(
    page.getByRole("cell", { name: "محاسب الاختبار", exact: false }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "فريق المكتب" })
    .click();
  await expect(
    page.getByRole("cell", { name: "محاسب الاختبار", exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "تسجيل الدخول" }),
  ).toBeVisible();
  await page.getByLabel("معرّف المكتب", { exact: false }).fill(id);
  await page
    .getByLabel("البريد الإلكتروني")
    .fill(`${id}-accountant@tests.invalid`);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "الدخول إلى المكتب" }).click();
  await expect(page.getByRole("heading", { name: /أهلاً بك/ })).toBeVisible();
  await expect(
    page.getByRole("navigation").getByRole("button", { name: "فريق المكتب" }),
  ).toHaveCount(0);
  const denied = await page.request.get("/api/v1/users");
  expect(denied.status()).toBe(403);
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/qa/overview-en-mobile.png",
    fullPage: true,
  });
});
test("password recovery link replaces the password and revokes the existing session", async ({
  page,
}) => {
  const slug = `reset-e2e-${Date.now()}`,
    email = `${slug}@tests.invalid`,
    password = "Before-Reset-Password-2026",
    newPassword = "After-Reset-Password-2026";
  await page.request.post("/api/v1/auth/register", {
    headers: { Origin: "http://localhost:4310" },
    data: {
      email,
      password,
      fullName: "مالك الاستعادة",
      officeName: "مكتب الاستعادة",
      slug,
      countryCode: "OM",
    },
  });
  const me = (await (await page.request.get("/api/v1/auth/me")).json()) as {
    user: { id: string };
    tenant: { id: string };
  };
  // Test fixture represents a received email link. No public token-disclosure endpoint exists.
  const token = randomBytes(32).toString("hex");
  await db.passwordReset.create({
    data: {
      userId: me.user.id,
      tenantId: me.tenant.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  await page.goto(`/#reset=${token}`);
  await expect(
    page.getByRole("heading", { name: "تعيين كلمة مرور جديدة" }),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  await page.getByLabel("كلمة المرور الجديدة").fill(newPassword);
  await page.getByLabel("تأكيد كلمة المرور").fill(newPassword);
  await page
    .getByRole("button", { name: "تعيين كلمة مرور جديدة", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("تم تحديث كلمة المرور");
  expect((await page.request.get("/api/v1/auth/me")).status()).toBe(401);
  await page.getByRole("button", { name: "العودة لتسجيل الدخول" }).click();
  await page.getByLabel("معرّف المكتب").fill(slug);
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "الدخول إلى المكتب" }).click();
  await expect(page.getByRole("heading", { name: /أهلاً بك/ })).toBeVisible();
});
test("authenticator setup, recovery code login and secure disable in the browser", async ({
  page,
}) => {
  const slug = `mfa-e2e-${Date.now()}`,
    email = `${slug}@tests.invalid`,
    password = "MFA-Browser-Password-2026";
  const registered = await page.request.post("/api/v1/auth/register", {
    headers: { Origin: "http://localhost:4310" },
    data: {
      email,
      password,
      fullName: "مالك المصادقة",
      officeName: "مكتب المصادقة",
      slug,
      countryCode: "OM",
    },
  });
  expect(registered.status()).toBe(201);
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "الجلسات والأجهزة" })
    .click();
  await page.getByLabel("كلمة المرور الحالية").fill(password);
  await page.getByRole("button", { name: "إعداد تطبيق المصادقة" }).click();
  const secret = await page
    .getByLabel("مفتاح تطبيق المصادقة", { exact: false })
    .inputValue();
  await page.getByLabel("رمز المصادقة أو رمز الاسترداد").fill(totp(secret));
  await page.getByRole("button", { name: "تأكيد التفعيل" }).click();
  await expect(page.getByText("احفظ رموز الاسترداد الآن")).toBeVisible();
  const codes = await page.locator(".recovery-codes code").allTextContents();
  expect(codes).toHaveLength(10);
  await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
  await page.getByLabel("معرّف المكتب").fill(slug);
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "الدخول إلى المكتب" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "أدخل رمز" }),
  ).toContainText("أدخل رمز");
  await page.getByLabel("رمز المصادقة أو رمز الاسترداد").fill(codes[0]!);
  await page.getByRole("button", { name: "الدخول إلى المكتب" }).click();
  await expect(page.getByRole("heading", { name: /أهلاً بك/ })).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "الجلسات والأجهزة" })
    .click();
  await page.getByLabel("كلمة المرور الحالية").fill(password);
  await page.getByLabel("رمز المصادقة أو رمز الاسترداد").fill(codes[1]!);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "تعطيل المصادقة الثنائية", exact: true })
    .click();
  await expect(page.locator(".mfa-panel .badge")).toHaveText("غير مفعّلة");
});
