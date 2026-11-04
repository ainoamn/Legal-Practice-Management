import { test, expect } from "@playwright/test";
test("legal workflow persists clients, cases, parties, hearings, tasks and Arabic/English mobile views", async ({
  page,
}) => {
  const slug = `legal-ui-${Date.now()}`;
  const registration = await page.request.post("/api/v1/auth/register", {
    headers: { Origin: "http://localhost:4310" },
    data: {
      email: `${slug}@tests.invalid`,
      password: "Legal-UI-Secure-Password-2026",
      fullName: "محامي المكتب",
      officeName: "مكتب العدالة",
      slug,
      countryCode: "OM",
    },
  });
  expect(registration.status()).toBe(201);
  await page.goto("/");
  await page
    .getByRole("button", { name: "العمل القانوني", exact: true })
    .click();
  const modules = page.getByRole("navigation", {
    name: "وحدات العمل القانوني",
  });
  await modules.getByRole("button", { name: "المحاكم", exact: true }).click();
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("اسم المحكمة").fill("محكمة مسقط التجريبية");
  await dialog.getByLabel("المنطقة").fill("مسقط");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "محكمة مسقط التجريبية" }),
  ).toBeVisible();
  await modules.getByRole("button", { name: "الموكلون", exact: true }).click();
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await dialog.getByLabel("اسم الموكل").fill("شركة الأمانة");
  await dialog.getByLabel("نوع الموكل").selectOption("COMPANY");
  await dialog.getByLabel("السجل التجاري").fill("UI-001");
  await dialog.getByLabel("ملاحظات داخلية").fill("تفاصيل اتصال خاصة");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "شركة الأمانة", exact: true }),
  ).toBeVisible();
  await modules.getByRole("button", { name: "القضايا", exact: true }).click();
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await dialog.getByLabel("عنوان القضية").fill("مطالبة أتعاب تجارية");
  await dialog
    .getByLabel("الموكل", { exact: false })
    .selectOption({ label: "شركة الأمانة" });
  await dialog
    .getByLabel("المحكمة", { exact: true })
    .selectOption({ label: "محكمة مسقط التجريبية" });
  await dialog.getByLabel("قيمة المطالبة").fill("12.345");
  await dialog
    .getByLabel("الموضوع والملخص")
    .fill("<script>alert('xss')</script> نص قانوني");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "مطالبة أتعاب تجارية" }),
  ).toBeVisible();
  await expect(page.getByText("12.345 OMR")).toBeVisible();
  await expect(
    page.getByText("<script>alert('xss')</script> نص قانوني", { exact: true }),
  ).toBeVisible();
  const details = page.getByRole("navigation", { name: "تفاصيل القضية" });
  await details.getByRole("button", { name: "الأطراف", exact: true }).click();
  await page.getByRole("button", { name: "إضافة طرف", exact: true }).click();
  await dialog.getByLabel("اسم الطرف").fill("شركة الخصم");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "شركة الخصم" })).toBeVisible();
  await details.getByRole("button", { name: "الجلسات", exact: true }).click();
  await page.getByRole("button", { name: "إضافة جلسة", exact: true }).click();
  await dialog.getByLabel("البداية بتوقيت جهازك").fill("2027-04-12T10:00");
  await dialog.getByLabel("النهاية بتوقيت جهازك").fill("2027-04-12T11:00");
  await dialog.getByLabel("القاعة أو رابط الجلسة").fill("القاعة ٢");
  await dialog.getByLabel("إنشاء مهمة تحضير").check();
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(/القاعة ٢/)).toBeVisible();
  await details.getByRole("button", { name: "المهام", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "تحضير الجلسة / Hearing preparation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "إضافة مهمة", exact: true }).click();
  await dialog.getByLabel("عنوان المهمة").fill("إعداد مذكرة");
  await dialog
    .getByLabel("الموعد النهائي بتوقيت جهازك")
    .fill("2027-04-10T09:00");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByLabel("حالة إعداد مذكرة", { exact: true })
    .selectOption("DONE");
  await expect(
    page.getByLabel("حالة إعداد مذكرة", { exact: true }),
  ).toHaveValue("DONE");
  await details.getByRole("button", { name: "الملاحظات", exact: true }).click();
  await page.getByRole("button", { name: "إضافة ملاحظة", exact: true }).click();
  await dialog
    .getByLabel("ملاحظة داخلية", { exact: true })
    .fill("استراتيجية داخلية سرية");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    page.getByText("استراتيجية داخلية سرية", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/qa/practice-matter-ar.png",
    fullPage: true,
  });
  await page.reload();
  await page
    .getByRole("button", { name: "العمل القانوني", exact: true })
    .click();
  await modules.getByRole("button", { name: "القضايا", exact: true }).click();
  await page
    .getByRole("button", { name: "مطالبة أتعاب تجارية", exact: true })
    .click();
  await details.getByRole("button", { name: "الملاحظات", exact: true }).click();
  await expect(
    page.getByText("استراتيجية داخلية سرية", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("navigation", { name: "Legal practice modules" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/qa/practice-en-mobile.png",
    fullPage: true,
  });
});
