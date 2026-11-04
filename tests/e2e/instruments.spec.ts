import { test, expect } from "@playwright/test";
test("contracts retain exact amounts, approve, track obligations and support bilingual mobile use", async ({
  page,
}) => {
  test.setTimeout(90000);
  const slug = `instruments-ui-${Date.now()}`,
    headers = { Origin: "http://localhost:4310" };
  expect(
    (
      await page.request.post("/api/v1/auth/register", {
        headers,
        data: {
          email: `${slug}@tests.invalid`,
          password: "Instrument-UI-Secure-Password-2026",
          fullName: "مدير العقود",
          officeName: "مكتب العقود",
          slug,
          countryCode: "OM",
        },
      })
    ).status(),
  ).toBe(201);
  const me = await (await page.request.get("/api/v1/auth/me")).json();
  await page.request.post("/api/v1/practice/clients", {
    headers,
    data: { name: "شركة العقود", branchId: me.branch.id },
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "العقود والوكالات والتراخيص", exact: true })
    .click();
  await page.getByRole("button", { name: "إضافة سجل", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("الموكل", { exact: true })
    .selectOption({ label: "شركة العقود" });
  await dialog
    .getByLabel("عنوان السجل", { exact: true })
    .fill("عقد الخدمات السنوي");
  await dialog
    .getByLabel("نوع العقد أو الوكالة", { exact: true })
    .fill("خدمات قانونية");
  await dialog
    .getByLabel("الطرف الأول / الموكل", { exact: true })
    .fill("شركة العقود");
  await dialog
    .getByLabel("الطرف الثاني", { exact: true })
    .fill("المكتب القانوني");
  await dialog.getByLabel("تاريخ الإصدار", { exact: true }).fill("2026-01-01");
  await dialog
    .getByLabel("تاريخ الانتهاء المسجل", { exact: true })
    .fill("2026-01-02");
  await dialog
    .getByLabel("قيمة السجل (اختيارية)", { exact: true })
    .fill("٩٩٩٩٩٩٩٩٩٩٩٩٩٩٩٩٩٫٩٩٩");
  await dialog
    .getByLabel("شروط العقد أو نطاق الوكالة", { exact: true })
    .fill("الشروط المتفق عليها\nبند تسليم الملفات");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "عقد الخدمات السنوي", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".instruments-console")).toContainText(
    "99999999999999999.999 OMR",
  );
  await page.getByRole("button", { name: "اعتماد السجل", exact: true }).click();
  await expect(
    page.locator(".instruments-console .badge").first(),
  ).toContainText("منتهي حسب التاريخ المسجل");
  await page.getByRole("button", { name: "إضافة التزام", exact: true }).click();
  await dialog
    .getByLabel("عنوان الالتزام", { exact: true })
    .fill("تسليم المستندات الأصلية");
  await dialog
    .getByLabel("الموعد بتوقيت جهازك", { exact: true })
    .fill("2027-01-01T10:00");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const obligation = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "تسليم المستندات الأصلية",
        exact: true,
      }),
    });
  await obligation.getByRole("combobox").selectOption("DONE");
  await expect(obligation.getByRole("combobox")).toHaveValue("DONE");
  await page.screenshot({
    path: ".local/qa/instruments-ar.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "تعديل السجل", exact: true }).click();
  await expect(
    dialog.getByLabel("قيمة السجل (اختيارية)", { exact: true }),
  ).toHaveValue("99999999999999999.999");
  await expect(
    dialog.getByLabel("شروط العقد أو نطاق الوكالة", { exact: true }),
  ).toHaveValue("الشروط المتفق عليها\nبند تسليم الملفات");
  await dialog.getByRole("button", { name: "إلغاء", exact: true }).click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "عقد الخدمات السنوي", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/qa/instruments-mobile-en.png",
    fullPage: true,
  });
});
