import { test, expect } from "@playwright/test";
test("calendar shows office dates, day/week/month views and persistent task board transitions", async ({
  page,
}) => {
  test.setTimeout(90000);
  const slug = `calendar-ui-${Date.now()}`,
    headers = { Origin: "http://localhost:4310" };
  expect(
    (
      await page.request.post("/api/v1/auth/register", {
        headers,
        data: {
          email: `${slug}@tests.invalid`,
          password: "Calendar-UI-Secure-Password-2026",
          fullName: "مدير المواعيد",
          officeName: "مكتب المواعيد",
          slug,
          countryCode: "OM",
        },
      })
    ).status(),
  ).toBe(201);
  const me = await (await page.request.get("/api/v1/auth/me")).json();
  const client = await (
    await page.request.post("/api/v1/practice/clients", {
      headers,
      data: { name: "موكل التقويم", branchId: me.branch.id },
    })
  ).json();
  const matter = await (
    await page.request.post("/api/v1/practice/matters", {
      headers,
      data: {
        title: "دعوى التقويم",
        clientId: client.id,
        branchId: me.branch.id,
        category: "CIVIL",
        countryCode: "OM",
      },
    })
  ).json();
  expect(
    (
      await page.request.post("/api/v1/practice/hearings", {
        headers,
        data: {
          matterId: matter.id,
          responsibleId: me.membership.id,
          startsAt: "2027-01-01T19:30:00Z",
          endsAt: "2027-01-01T20:30:00Z",
          room: "قاعة الاختبار",
          reminderMinutes: [],
        },
      })
    ).status(),
  ).toBe(201);
  const task = await (
    await page.request.post("/api/v1/practice/tasks", {
      headers,
      data: {
        matterId: matter.id,
        assignedTo: me.membership.id,
        title: "إيداع مذكرة التقويم",
        dueAt: "2027-01-01T20:15:00Z",
        priority: "HIGH",
      },
    })
  ).json();
  await page.goto("/");
  await page
    .getByRole("button", { name: "التقويم ولوحة المهام", exact: true })
    .click();
  await page
    .getByLabel("التاريخ المختار بتوقيت المكتب", { exact: true })
    .fill("2027-01-02");
  const nav = page.getByRole("navigation", { name: "عروض التقويم" });
  await nav.getByRole("button", { name: "يوم", exact: true }).click();
  await expect(page.locator(".calendar-grid .hearing")).toHaveCount(1);
  await expect(page.locator(".calendar-grid .task")).toHaveCount(1);
  await expect(page.locator(".calendar-grid .hearing")).toContainText(
    "دعوى التقويم",
  );
  await nav.getByRole("button", { name: "أسبوع", exact: true }).click();
  await expect(page.locator(".calendar-day")).toHaveCount(7);
  await nav.getByRole("button", { name: "شهر", exact: true }).click();
  await expect(page.locator(".calendar-day")).toHaveCount(42);
  await page.screenshot({
    path: ".local/qa/calendar-month-ar.png",
    fullPage: true,
  });
  await nav.getByRole("button", { name: "لوحة المهام", exact: true }).click();
  await page
    .getByRole("combobox", { name: "نقل إيداع مذكرة التقويم", exact: true })
    .selectOption("DONE");
  await expect(
    page
      .locator(".calendar-column")
      .filter({ has: page.getByRole("heading", { name: /مكتمل/ }) }),
  ).toContainText("إيداع مذكرة التقويم");
  const tasks = await (await page.request.get("/api/v1/practice/tasks")).json();
  expect(tasks.items.find((t: { id: string }) => t.id === task.id).status).toBe(
    "DONE",
  );
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("navigation", { name: "Calendar views" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const board = page.getByRole("region", {
    name: "Task status columns",
    exact: true,
  });
  await board.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  const completedTask = board.getByRole("button", {
    name: /إيداع مذكرة التقويم/,
  });
  await completedTask.scrollIntoViewIfNeeded();
  await expect(completedTask).toBeInViewport();
  await page.screenshot({
    path: ".local/qa/calendar-board-mobile-en.png",
    fullPage: true,
  });
});
