import { test, expect } from "@playwright/test";
test("firm finance posts invoices, receipts, expenses and separate client funds through the UI", async ({
  page,
}) => {
  test.setTimeout(90000);
  const slug = `finance-ui-${Date.now()}`,
    headers = { Origin: "http://localhost:4310" };
  expect(
    (
      await page.request.post("/api/v1/auth/register", {
        headers,
        data: {
          email: `${slug}@tests.invalid`,
          password: "Finance-UI-Secure-Password-2026",
          fullName: "مسؤول المالية",
          officeName: "مكتب المالية",
          slug,
          countryCode: "OM",
        },
      })
    ).status(),
  ).toBe(201);
  const me = await (await page.request.get("/api/v1/auth/me")).json();
  await page.request.post("/api/v1/practice/clients", {
    headers,
    data: { name: "موكل الفاتورة", branchId: me.branch.id },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "مالية المكتب", exact: true }).click();
  const modules = page.getByRole("navigation", { name: "وحدات المالية" }),
    dialog = page.getByRole("dialog");
  await modules
    .getByRole("button", { name: "الفواتير والتحصيل", exact: true })
    .click();
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await dialog
    .getByLabel("الموكل", { exact: true })
    .selectOption({ label: "موكل الفاتورة" });
  await dialog.getByLabel("الوصف", { exact: true }).fill("أتعاب الاستشارة");
  await dialog.getByLabel("الكمية", { exact: true }).fill("2");
  await dialog.getByLabel("سعر الوحدة (OMR)", { exact: true }).fill("10.001");
  await dialog.getByLabel("الخصم على الإجمالي").fill("0.002");
  await dialog.getByLabel("الضريبة (%) وفق إعداد المكتب").fill("5");
  await dialog
    .getByLabel("تاريخ الاستحقاق بتوقيت جهازك")
    .fill("2027-05-01T10:00");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("cell", { name: "21.000 OMR", exact: true }).first(),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "إصدار", exact: true }).click();
  await page.getByRole("button", { name: "تسجيل دفعة", exact: true }).click();
  await dialog.getByLabel("رقم المرجع الفريد").fill("BANK-001");
  await dialog.getByLabel("المبلغ (OMR)").fill("21.000");
  await dialog.getByLabel("تاريخ الدفع بتوقيت جهازك").fill("2026-11-03T10:00");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("cell", { name: "مدفوعة", exact: true }),
  ).toBeVisible();
  await modules.getByRole("button", { name: "المصروفات", exact: true }).click();
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await dialog.getByLabel("الوصف", { exact: true }).fill("رسوم قضائية");
  await dialog.getByLabel("التصنيف", { exact: true }).fill("COURT_FEES");
  await dialog.getByLabel("المورد / الجهة").fill("المحكمة");
  await dialog.getByLabel("المبلغ (OMR)").fill("2.500");
  await dialog
    .getByLabel("تاريخ المصروف بتوقيت جهازك")
    .fill("2026-11-03T10:00");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "اعتماد وتسجيل الصرف", exact: true })
    .click();
  await expect(
    page.getByText("معتمد ومسجل كمصروف مدفوع", { exact: true }),
  ).toBeVisible();
  await modules
    .getByRole("button", { name: "أمانات الموكلين", exact: true })
    .click();
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await dialog
    .getByLabel("الموكل", { exact: true })
    .selectOption({ label: "موكل الفاتورة" });
  await dialog.getByLabel("رقم المرجع الفريد").fill("TRUST-001");
  await dialog.getByLabel("الوصف", { exact: true }).fill("أمانة موكل مستقلة");
  await dialog.getByLabel("المبلغ (OMR)").fill("50.000");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".finance-balance")).toContainText("50.000 OMR");
  await modules.getByRole("button", { name: "التقارير", exact: true }).click();
  await expect(
    page.locator(".finance-console .stat-card").nth(0),
  ).toContainText("20.000 OMR");
  await expect(
    page.locator(".finance-console .stat-card").nth(2),
  ).toContainText("17.500 OMR");
  await page.screenshot({
    path: ".local/qa/finance-trial-balance-ar.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "مالية المكتب", exact: true }).click();
  await expect(
    page.locator(".finance-console .stat-card").nth(2),
  ).toContainText("17.500 OMR");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("navigation", { name: "Finance modules" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
