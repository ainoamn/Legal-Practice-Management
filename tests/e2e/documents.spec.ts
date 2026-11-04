import { test, expect } from "@playwright/test";
import { db, inTenant } from "../../packages/database/src/index.js";
test.afterAll(async () => db.$disconnect());
test("private legal draft, real scanning, review, approval and publication in the browser", async ({
  page,
}) => {
  test.setTimeout(180000);
  const slug = `documents-ui-${Date.now()}`,
    origin = { Origin: "http://localhost:4310" };
  expect(
    (
      await page.request.post("/api/v1/auth/register", {
        headers: origin,
        data: {
          email: `${slug}@tests.invalid`,
          password: "Document-UI-Password-2026",
          fullName: "مراجع المستندات",
          officeName: "مكتب المستندات",
          slug,
          countryCode: "OM",
        },
      })
    ).status(),
  ).toBe(201);
  const me = await (await page.request.get("/api/v1/auth/me")).json();
  const client = await (
    await page.request.post("/api/v1/practice/clients", {
      headers: origin,
      data: { name: "موكل المستند", branchId: me.branch.id },
    })
  ).json();
  const matter = await (
    await page.request.post("/api/v1/practice/matters", {
      headers: origin,
      data: {
        title: "قضية المستند",
        clientId: client.id,
        branchId: me.branch.id,
        category: "CIVIL",
        countryCode: "OM",
      },
    })
  ).json();
  expect(matter.id).toBeTruthy();
  await page.goto("/");
  await page
    .getByRole("button", { name: "العمل القانوني", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "وحدات العمل القانوني" })
    .getByRole("button", { name: "القضايا", exact: true })
    .click();
  await page.getByRole("button", { name: "قضية المستند", exact: true }).click();
  await page
    .getByRole("navigation", { name: "تفاصيل القضية" })
    .getByRole("button", { name: "المستندات", exact: true })
    .click();
  await page.getByRole("button", { name: "مستند جديد", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("عنوان المستند").fill("مذكرة دفاع عربية");
  await dialog
    .getByLabel("النص القانوني")
    .fill(
      "مذكرة قانونية تحتاج إلى مراجعة بشرية\nالمكتب: {{office_name}}\nالقضية: {{case_reference}}\n<script>window.injected=true</script>",
    );
  await dialog
    .getByRole("button", { name: "إنشاء المستند", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText("مذكرة دفاع عربية", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "تأكيد المراجعة البشرية", exact: true }),
  ).toBeEnabled({ timeout: 120000 });
  // Fixture represents a transient scanner failure; retry uses the real queue, S3 and scanner.
  const record = (
    await (
      await page.request.get(`/api/v1/practice/documents?matterId=${matter.id}`)
    ).json()
  ).items[0];
  await inTenant(me.tenant.id, async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.member_id',${me.membership.id},true)`;
    await tx.documentVersion.update({
      where: { id: record.versions[0].id },
      data: { state: "FAILED", failureCode: "SCANNER_UNAVAILABLE" },
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "العمل القانوني", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "وحدات العمل القانوني" })
    .getByRole("button", { name: "القضايا", exact: true })
    .click();
  await page.getByRole("button", { name: "قضية المستند", exact: true }).click();
  await page
    .getByRole("navigation", { name: "تفاصيل القضية" })
    .getByRole("button", { name: "المستندات", exact: true })
    .click();
  await page
    .getByRole("button", { name: "مذكرة دفاع عربية", exact: true })
    .click();
  await page
    .getByRole("button", { name: "إعادة معالجة الملف", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "تأكيد المراجعة البشرية", exact: true }),
  ).toBeEnabled({ timeout: 120000 });
  expect(await page.evaluate(() => "injected" in window)).toBe(false);
  await page
    .getByRole("button", { name: "تأكيد المراجعة البشرية", exact: true })
    .click();
  await page.getByLabel("إتاحة الإصدار المعتمد للموكل").check();
  await page
    .getByRole("button", { name: "اعتماد الإصدار", exact: true })
    .click();
  await expect(
    page.locator(".documents-panel > .practice-toolbar .badge"),
  ).toHaveText("معتمد");
  await expect(
    page.getByRole("link", { name: "معاينة وتصدير PDF" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "تصدير Word" })).toBeVisible();
  await page.screenshot({
    path: ".local/qa/documents-approved-ar.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Approve version", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
