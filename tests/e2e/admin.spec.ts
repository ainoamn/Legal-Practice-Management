import { test, expect } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import { platformDatabase } from "../../packages/database/src/index.js";
import { hashPassword } from "../../apps/api/src/auth/password.js";
import {
  totp,
  base32Encode,
  encryptSecret,
} from "../../apps/api/src/auth/totp.js";
import { platformPermissions } from "../../packages/contracts/src/platform.js";
import { requireTestDatabase } from "../setup-env.js";
requireTestDatabase();
test.afterAll(async () => platformDatabase().$disconnect());
test("Admin MFA, plans, subscriptions, receipts, published pages and branding work end to end", async ({
  page,
}) => {
  test.setTimeout(90000);
  const marker = randomUUID().slice(0, 8),
    password = "Admin-Browser-Password-2026!",
    email = `admin-browser-${marker}@tests.invalid`;
  await platformDatabase().platformAdmin.create({
    data: {
      email,
      name: "مدير اختبار المنصة",
      passwordHash: await hashPassword(password),
      kind: "OWNER",
      permissions: [...platformPermissions],
    },
  });
  const registered = await page.request.post("/api/v1/auth/register", {
    headers: { Origin: "http://localhost:4310" },
    data: {
      email: `firm-browser-${marker}@tests.invalid`,
      password,
      fullName: "مالك الاختبار",
      officeName: `مكتب ${marker}`,
      slug: `admin-firm-${marker}`,
      countryCode: "OM",
    },
  });
  expect(registered.status()).toBe(201);
  const tenantId = (
    (await (await page.request.get("/api/v1/auth/me")).json()) as {
      tenant: { id: string };
    }
  ).tenant.id;
  await page.goto("/admin");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "الدخول", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "أمّن حساب إدارة المنصة" }),
  ).toBeVisible();
  await page.getByLabel("كلمة المرور الحالية").fill(password);
  await page.getByRole("button", { name: "إعداد تطبيق المصادقة" }).click();
  const secret = await page.getByLabel("مفتاح تطبيق المصادقة").inputValue();
  await page
    .getByLabel("رمز تطبيق المصادقة", { exact: true })
    .fill(totp(secret));
  await page.getByRole("button", { name: "تأكيد وفتح الإدارة" }).click();
  await expect(
    page.getByRole("heading", { name: "المؤشرات", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/qa/admin-overview.png",
    fullPage: true,
  });
  const nav = page.getByRole("navigation", { name: "إدارة المنصة" });
  const planName = `باقة ${marker}`;
  await nav.getByRole("button", { name: "الباقات", exact: true }).click();
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("الاسم", { exact: true }).fill(planName);
  await dialog.getByLabel("سعر الباقة").fill("15.750");
  await dialog.getByLabel("أقصى عدد مستخدمين").fill("3");
  await dialog.getByLabel("أقصى عدد قضايا").fill("20");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: planName, exact: true }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "الاشتراكات", exact: true }).click();
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("المكتب", { exact: true }).selectOption(tenantId);
  await dialog
    .getByLabel("الباقة", { exact: true })
    .selectOption({ label: planName });
  await dialog
    .getByLabel("نهاية فترة الاشتراك")
    .fill(new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 16));
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: planName, exact: true }),
  ).toBeVisible();
  const description = `اشتراك ${marker}`;
  await nav.getByRole("button", { name: "فواتير المنصة", exact: true }).click();
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("المكتب", { exact: true }).selectOption(tenantId);
  await dialog.getByLabel("الوصف", { exact: true }).fill(description);
  await dialog.getByLabel("المبلغ", { exact: true }).fill("7.000");
  await dialog
    .getByLabel("تاريخ استحقاق الفاتورة")
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: description, exact: true }),
  ).toBeVisible();
  const invoices = (await (
    await page.request.get(`/api/v1/platform/invoices?search=${marker}`)
  ).json()) as { items: { id: string }[] };
  const invoiceId = invoices.items[0]!.id;
  await nav
    .getByRole("button", { name: "المعاملات والتحصيل", exact: true })
    .click();
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("الفاتورة", { exact: true }).selectOption(invoiceId);
  await dialog.getByLabel("المبلغ", { exact: true }).fill("3.000");
  await dialog.getByLabel("مرجع تحصيل فريد").fill(`browser-${marker}`);
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: `browser-${marker}`, exact: true }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "فواتير المنصة", exact: true }).click();
  await expect(
    page
      .getByRole("row")
      .filter({
        has: page.getByRole("cell", { name: description, exact: true }),
      })
      .getByRole("cell", { name: "4.000 OMR", exact: true }),
  ).toBeVisible();
  const slug = `browser-policy-${marker}`,
    title = `سياسة ${marker}`;
  await nav.getByRole("button", { name: "صفحات الموقع", exact: true }).click();
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("عنوان الصفحة").fill(title);
  await dialog.getByLabel("المعرّف", { exact: true }).fill(slug);
  await dialog
    .getByLabel("المحتوى المنشور (نص آمن)")
    .fill("<script>window.__unsafe=1</script>\nمحتوى منشور من قاعدة البيانات");
  await dialog.getByLabel("الحالة", { exact: true }).selectOption("PUBLISHED");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: title, exact: false }),
  ).toBeVisible();
  await page.goto(`/pages/${slug}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  expect(await page.evaluate(() => Object.hasOwn(window, "__unsafe"))).toBe(
    false,
  );
  await page.goto("/admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "الأمان والمراقبة", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "سجل تدقيق المنصة" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table").filter({ hasText: "page.published" }),
  ).toContainText("page.published");
  await page.screenshot({
    path: ".local/qa/admin-security.png",
    fullPage: true,
  });
  const original = (await (
    await page.request.get("/api/v1/platform/settings")
  ).json()) as {
    brandName: string;
    primaryColor: string;
    supportEmail: string | null;
    registrationOpen: boolean;
  } | null;
  try {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "الهوية والإعدادات", exact: true })
      .click();
    await page.getByRole("button", { name: "تعديل", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("اسم المنصة").fill(`منصة ${marker}`);
    await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(page.locator("dl")).toContainText(`منصة ${marker}`);
    await page.goto("/");
    await expect(page.locator(".brand")).toContainText(`منصة ${marker}`);
  } finally {
    await page.request.post("/api/v1/platform/settings", {
      headers: { Origin: "http://localhost:4310" },
      data: original
        ? {
            brandName: original.brandName,
            primaryColor: original.primaryColor,
            registrationOpen: original.registrationOpen,
            supportEmail: original.supportEmail ?? "",
          }
        : {
            brandName: "LEGAL OFFICE AI",
            primaryColor: "#087e83",
            supportEmail: "",
            registrationOpen: true,
          },
    });
  }
  await page.goto("/admin");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".local/qa/admin-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Subscriptions", exact: true })
    .click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog
      .getByLabel("Firm", { exact: true })
      .locator(`option[value="${tenantId}"]`),
  ).toHaveCount(1);
  await dialog.getByText("Cancel", { exact: true }).click();
  const operatorId = randomUUID(),
    operatorSecret = base32Encode(randomBytes(20)),
    operatorEmail = `browser-operator-${marker}@tests.invalid`;
  await platformDatabase().platformAdmin.create({
    data: {
      id: operatorId,
      email: operatorEmail,
      name: "Scoped operator",
      passwordHash: await hashPassword(password),
      permissions: ["plans:read", "subscriptions:read", "subscriptions:manage"],
      encryptedSecret: encryptSecret(operatorSecret, operatorId),
    },
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Email address", { exact: true }).fill(operatorEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByLabel("Authenticator code", { exact: true })
    .fill(totp(operatorSecret));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Subscriptions", exact: true })
    .click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByLabel("Firm", { exact: true })
      .locator("option"),
  ).toHaveCount(1);
  expect((await page.request.get("/api/v1/platform/tenants")).status()).toBe(
    403,
  );
});
