import { test, expect } from "@playwright/test";
const password = "ParkHawkDemo2026!";
test("student and admin workflows, privacy, responsive layouts, and server authorization", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page).toHaveURL(/login/);
  await page
    .getByLabel("Email", { exact: true })
    .fill("student60@parkhawk.demo");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Where should I park right now?" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: "docs/screenshots/dashboard.png",
    fullPage: true,
  });
  const adminDenied = await page.request.get("/api/admin");
  expect(adminDenied.status()).toBe(403);
  const state = await (await page.request.get("/api/dashboard")).json();
  expect(
    state.reports.every(
      (r: Record<string, unknown>) =>
        r.report_type !== "SEARCHING" && !("user_id" in r),
    ),
  ).toBe(true);
  const forbidden = await page.request.post("/api/admin", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { action: "suspend", user_id: state.user.id, hours: 24 },
  });
  expect(forbidden.status()).toBe(403);
  await page.goto("/admin");
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await page.getByRole("button", { name: "Report parking info" }).click();
  await page
    .getByLabel("Parking location", { exact: true })
    .selectOption(
      state.lots.find((l: { name: string }) => l.name === "Lot 60").id,
    );
  await page.getByLabel("Spaces seen").selectOption("2");
  await page.getByLabel("Short note (optional)").fill("Near the entrance");
  await page
    .getByRole("button", { name: "Submit report", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Report shared");
  const updated = await (await page.request.get("/api/dashboard")).json();
  const open = updated.reports.find(
    (r: { own: boolean; report_type: string }) =>
      r.own && r.report_type === "OPEN_SPOT",
  );
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  const second = await other.newPage();
  await second.goto("/login");
  await second
    .getByLabel("Email", { exact: true })
    .fill("student2@parkhawk.demo");
  await second.getByLabel("Password", { exact: true }).fill(password);
  await second.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(second).toHaveURL("http://127.0.0.1:3100/");
  await second.goto(`/lots/${open.parking_location_id}`);
  const card = second
    .locator(".spot-card")
    .filter({ hasText: "Near the entrance" });
  await card.getByRole("button", { name: "Still open", exact: true }).click();
  await expect(card).toContainText("Response recorded");
  const duplicate = await second.request.post("/api/feedback", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { report_id: open.id, feedback_type: "STILL_OPEN" },
  });
  expect(duplicate.status()).toBe(409);
  await page.goto(`/lots/${open.parking_location_id}`);
  await page.screenshot({
    path: "docs/screenshots/lot-detail.png",
    fullPage: true,
  });
  for (const [name, value, label] of [
    ["Leaving soon", "10", "When are you leaving?"],
    ["Looking for parking", "", ""],
    ["Traffic", "HEAVY", "Traffic conditions"],
  ]) {
    await page.getByRole("button", { name: "Report parking info" }).click();
    await page.getByRole("button", { name, exact: true }).click();
    if (label) await page.getByLabel(label).selectOption(value);
    await page
      .getByRole("button", {
        name:
          name === "Looking for parking" ? "I'm looking here" : "Submit report",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Report parking info" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close report form" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/login/);
  await page.getByRole("button", { name: "Fill admin login" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await page.goto("/admin");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByRole("heading", { name: "Keep the community on track." }),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: "Parking locations", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Test overflow lot");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Temporary demo test area");
  await page.getByRole("button", { name: "Save location" }).click();
  await expect(
    page.locator(".location-row").filter({ hasText: "Test overflow lot" }),
  ).toBeVisible();
  const newLot = page
    .locator(".location-row")
    .filter({ hasText: "Test overflow lot" });
  await newLot.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Active and visible to users").uncheck();
  await page.getByRole("button", { name: "Save location" }).click();
  await expect(newLot).toContainText("Disabled");
  await page.getByRole("tab", { name: "Users", exact: true }).click();
  const row = page
    .getByRole("row")
    .filter({ hasText: "student2@parkhawk.demo" });
  await row.getByRole("button", { name: "Suspend 24h" }).click();
  await expect(row).toContainText("Suspended until");
  const suspended = await second.request.post("/api/reports", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      report_type: "SEARCHING",
      parking_location_id: open.parking_location_id,
    },
  });
  expect(suspended.status()).toBe(403);
  await row.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(row).toContainText("Enabled");
  await page.getByRole("tab", { name: "Reports", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Remove", exact: true })
    .first()
    .click();
  await expect(page.getByRole("status")).toContainText("Changes saved");
  await page.screenshot({ path: "docs/screenshots/admin.png", fullPage: true });
  const csrf = await page.request.post("/api/admin", {
    headers: { origin: "https://other.example" },
    data: { action: "suspend", user_id: state.user.id, hours: 24 },
  });
  expect(csrf.status()).toBe(403);
  await other.close();
  expect(errors).toEqual([]);
});
