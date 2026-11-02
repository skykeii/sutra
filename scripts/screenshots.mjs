// Read-only. Saves screenshots of the key pages at desktop and phone width, and reports console errors,
// default titles and clipped text. Usage: node scripts/screenshots.mjs <out-dir>
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "screenshots";
const PASSWORD = "Demo@12345";

const PAGES = {
  public: ["/", "/login", "/verify", "/verify/SUTRA-DEMO-VALID", "/verify/SUTRA-DEMO-REVOKED", "/transparency", "/docs", "/portal-demo", "/not-a-real-page"],
  "aicte.admin": ["/aicte", "/aicte/audit", "/aicte/fraud", "/aicte/ask", "/aicte/quota"],
  "admin.deccan": ["/institution", "/institution/upload", "/institution/integration"],
  "verifier.navayuga": ["/verifier", "/verifier/requests"],
  student1: ["/student", "/student/consents", "/student/marksheet"],
  "admin.jntuh": ["/university", "/university/results", "/university/certificates"],
};
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 375, height: 812 } };

const name = (handle, path) => `${handle}${path.replace(/[/?=&]/g, "_")}`.replace(/_$/, "");

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const problems = [];
for (const [size, viewport] of Object.entries(SIZES)) {
  for (const [handle, paths] of Object.entries(PAGES)) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 160)}`));
    if (handle !== "public") {
      await page.goto(`${BASE}/login`);
      await page.getByLabel("Email").fill(`${handle}@sutra.example`);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
    }
    for (const path of paths) {
      errors.length = 0;
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }).catch(() => undefined);
      await page.waitForTimeout(600);
      const report = await page.evaluate(() => {
        const clipped = [...document.querySelectorAll("main h1, main h2, main h3, main button, main a, main p, main td, main th, main span")]
          .filter((el) => {
            const box = el.getBoundingClientRect();
            if (!box.width || !el.textContent?.trim() || el.children.length) return false;
            const style = getComputedStyle(el);
            return el.scrollWidth > el.clientWidth + 1 && style.overflow !== "visible" && style.textOverflow !== "ellipsis";
          })
          .slice(0, 3)
          .map((el) => el.textContent.trim().slice(0, 50));
        return { title: document.title, clipped, text: document.body.innerText };
      });
      const bad = /\b(lorem|undefined|\[object Object\]|NaN)\b/i.exec(report.text)?.[0];
      await page.screenshot({ path: join(OUT, `${size}-${name(handle, path)}.png`), fullPage: true });
      const notes = [...new Set(errors)];
      if (report.title === "Sutra" && path !== "/") notes.push("default title");
      if (report.clipped.length) notes.push(`clipped: ${report.clipped.join(" | ")}`);
      if (bad) notes.push(`text: ${bad}`);
      if (notes.length) problems.push(`${size} ${handle} ${path}: ${notes.join("; ")}`);
    }
    if (handle === "admin.deccan") {
      await page.goto(`${BASE}/institution/upload`);
      await page.getByRole("button", { name: "Continue" }).click();
      await page.locator('input[type="file"]').setInputFiles("demo-files/messy_upload.csv");
      await page.getByText("messy_upload.csv: 120 rows").waitFor({ timeout: 30_000 });
      await page.screenshot({ path: join(OUT, `${size}-admin.deccan_upload_preview.png`), fullPage: true });
    }
    await context.close();
  }
}
await browser.close();
console.log(problems.length ? problems.join("\n") : "No console errors, default titles or clipped text.");
