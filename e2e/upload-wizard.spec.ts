import { join } from "node:path";
import { expect, test } from "@playwright/test";

const file = (name: string) => join(process.cwd(), "demo-files", name);

// Stops at the preview step. Nothing is ever submitted, so no data is written.
test("upload works first time, and a second file keeps its own name", async ({ page }) => {
  const sentNames: string[] = [];
  page.on("request", (req) => {
    if (req.url().endsWith("/api/app/upload") && req.method() === "POST") {
      const body = req.postDataJSON() as { fileName: string; commit?: boolean };
      expect(body.commit).toBeFalsy();
      sentNames.push(body.fileName);
    }
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("admin.deccan@sutra.example");
  await page.getByLabel("Password").fill("Demo@12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/institution");

  await page.goto("/institution/upload");
  await page.getByLabel("Program").selectOption({ label: "B.Tech Electronics & Communication (2026-27), intake 60" });
  await page.getByRole("button", { name: "Continue" }).click();

  await page.locator('input[type="file"]').setInputFiles(file("clean_upload.csv"));
  await expect(page.getByText("clean_upload.csv: 12 rows")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  await expect(page.getByRole("table")).toBeVisible();

  await page.getByRole("button", { name: "Choose another file" }).click();
  await page.locator('input[type="file"]').setInputFiles(file("messy_upload.csv"));
  await expect(page.getByText("messy_upload.csv: 120 rows")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("table")).toBeVisible();

  expect(sentNames).toEqual(["clean_upload.csv", "messy_upload.csv"]);
});
