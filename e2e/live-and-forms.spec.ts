import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import Papa from "papaparse";

async function signIn(page: Page, handle: string, landing: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`${handle}@sutra.example`);
  await page.getByLabel("Password").fill("Demo@12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`**${landing}`);
}

test("the dashboard connects live with a single Supabase client", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (m) => warnings.push(m.text()));
  await signIn(page, "aicte.admin", "/aicte");
  await expect(page.getByText("Live", { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(warnings.filter((w) => /GoTrueClient/.test(w))).toEqual([]);
});

// These two write data, so they run only when asked to, before a reset.
test.describe("writes", () => {
  test.skip(!process.env.E2E_ALLOW_WRITES, "Set E2E_ALLOW_WRITES=1 to run tests that write data");

  test("a new alert appears on the dashboard without a refresh", async ({ page, browser }) => {
    await signIn(page, "aicte.admin", "/aicte");
    await expect(page.getByText("Live", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2000);
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const student = await context.newPage();
    await signIn(student, "student4", "/student");
    const res = await student.request.post("/api/app/marksheet", { data: { semester: 4, claimed_pct: 78 } });
    expect((await res.json()).outcome).toBe("Mismatch");
    await expect(page.getByText("New alert: Marks claim does not match the university")).toBeVisible({ timeout: 20_000 });
    await context.close();
  });

  test("saving one student shows a confirmation and clears the form", async ({ page }) => {
    const rows = Papa.parse<Record<string, string>>(readFileSync(join(process.cwd(), "demo-files", "clean_upload.csv"), "utf8"), { header: true, skipEmptyLines: "greedy" }).data;
    const row = rows[0]!;
    await signIn(page, "admin.deccan", "/institution");
    await page.goto("/institution/students/new");
    await page.locator("#program").selectOption({ label: "B.Tech Electronics & Communication" });
    for (const [field, value] of Object.entries(row)) {
      const el = page.locator(`[id="${field}"]`);
      if ((await el.evaluate((n) => n.tagName)) === "SELECT") await el.selectOption(value);
      else await el.fill(value);
    }
    await page.getByRole("button", { name: "Save record" }).click();
    await expect(page.getByText("Student saved")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#apaar_id")).toHaveValue("");
    await page.locator("#program").selectOption({ label: "B.Tech Electronics & Communication" });
    for (const [field, value] of Object.entries(row)) {
      const el = page.locator(`[id="${field}"]`);
      if ((await el.evaluate((n) => n.tagName)) === "SELECT") await el.selectOption(value);
      else await el.fill(value);
    }
    await page.getByRole("button", { name: "Save record" }).click();
    await expect(page.locator('[role="alert"]').filter({ hasText: "Not saved." })).toBeVisible({ timeout: 20_000 });
  });
});
