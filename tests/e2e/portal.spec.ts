import { test, expect } from "@playwright/test";
test("firm links a client, publishes a case and exchanges messages through a separate client portal", async ({
  page,
}) => {
  const slug = `portal-ui-${Date.now()}`,
    password = "Portal-UI-Password-2026",
    email = `${slug}-client@tests.invalid`,
    headers = { Origin: "http://localhost:4310" };
  expect(
    (
      await page.request.post("/api/v1/auth/register", {
        headers,
        data: {
          email: `${slug}@tests.invalid`,
          password,
          fullName: "مالك البوابة",
          officeName: "مكتب البوابة",
          slug,
          countryCode: "OM",
        },
      })
    ).status(),
  ).toBe(201);
  const me = await (await page.request.get("/api/v1/auth/me")).json(),
    roles = await (await page.request.get("/api/v1/roles")).json(),
    role = roles.find((r: { key: string }) => r.key === "CLIENT");
  await page.request.post("/api/v1/users", {
    headers,
    data: {
      email,
      password,
      fullName: "موكل البوابة",
      roleId: role.id,
      branchId: me.branch.id,
    },
  });
  const client = await (
    await page.request.post("/api/v1/practice/clients", {
      headers,
      data: {
        name: "ملف موكل البوابة",
        branchId: me.branch.id,
        notes: "PRIVATE CLIENT NOTE",
      },
    })
  ).json();
  await page.request.post("/api/v1/practice/matters", {
    headers,
    data: {
      title: "قضية منشورة للموكل",
      clientId: client.id,
      branchId: me.branch.id,
      category: "CIVIL",
      countryCode: "OM",
      summary: "PRIVATE LEGAL STRATEGY",
    },
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "العمل القانوني", exact: true })
    .click();
  const modules = page.getByRole("navigation", {
    name: "وحدات العمل القانوني",
  });
  await modules.getByRole("button", { name: "الموكلون", exact: true }).click();
  await page
    .getByRole("button", { name: "ملف موكل البوابة", exact: true })
    .click();
  await page
    .getByLabel("حساب الموكل", { exact: true })
    .selectOption({ label: `موكل البوابة · ${email}` });
  await page.getByRole("button", { name: "ربط الحساب", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "إيقاف الوصول", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("رسالة للموكل", { exact: true })
    .fill("مرحباً، نتابع قضيتك وسنطلعك على المستجدات.");
  await page.getByRole("button", { name: "إرسال", exact: true }).click();
  await expect(
    page.getByText("مرحباً، نتابع قضيتك وسنطلعك على المستجدات.", {
      exact: true,
    }),
  ).toBeVisible();
  await modules.getByRole("button", { name: "القضايا", exact: true }).click();
  await page
    .getByRole("button", { name: "قضية منشورة للموكل", exact: true })
    .click();
  await page
    .getByRole("button", { name: "نشر في بوابة الموكل", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "سحب من بوابة الموكل", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
  await page.getByLabel("معرّف المكتب").fill(slug);
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "الدخول إلى المكتب", exact: true })
    .click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(
    page.getByRole("heading", { name: "قضية منشورة للموكل", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("مرحباً، نتابع قضيتك وسنطلعك على المستجدات.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("PRIVATE LEGAL STRATEGY", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("PRIVATE CLIENT NOTE", { exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/v1/users")).status()).toBe(403);
  expect((await page.request.get("/api/v1/practice/matters")).status()).toBe(
    403,
  );
  await page
    .getByLabel("رسالتك", { exact: true })
    .fill("شكراً، أرجو تحديد موعد للاجتماع.");
  await page
    .getByRole("button", { name: "إرسال الرسالة", exact: true })
    .click();
  await expect(
    page.getByText("شكراً، أرجو تحديد موعد للاجتماع.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("تفاصيل الطلب", { exact: true })
    .fill("أرغب في موعد لمراجعة المستندات");
  await page.getByRole("button", { name: "إرسال الطلب", exact: true }).click();
  await expect(
    page.getByText("أرغب في موعد لمراجعة المستندات", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/qa/client-portal-ar.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
