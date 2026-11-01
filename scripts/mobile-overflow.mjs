const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "Demo@12345";
const WIDTH = 375;

const ACCOUNTS = {
  "aicte.admin": ["/aicte", "/aicte/alerts", "/aicte/records", "/aicte/quota", "/aicte/duplicates", "/aicte/fraud", "/aicte/ask", "/aicte/reports", "/aicte/approvals", "/aicte/audit", "/aicte/rules", "/settings/security", "/search?q=abcdef"],
  "admin.deccan": ["/institution", "/institution/upload", "/institution/students", "/institution/students/new", "/institution/issues", "/institution/history", "/institution/marksheet", "/institution/reports", "/institution/integration", "/search?q=a"],
  "admin.jntuh": ["/university", "/university/results", "/university/certificates"],
  "verifier.navayuga": ["/verifier", "/verifier/requests"],
  student1: ["/student", "/student/consents", "/student/scholarships", "/student/marksheet"],
};

let chromium;
try {
  ({ chromium } = await import("@playwright/test"));
} catch {
  console.log("Playwright is not installed, so nothing was checked.");
  process.exit(0);
}

const browser = await chromium.launch();
let failures = 0;
let checked = 0;
for (const [handle, pages] of Object.entries(ACCOUNTS)) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: 812 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(`${handle}@sutra.example`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  for (const path of pages) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    checked += 1;
    if (overflow > 0) {
      failures += 1;
      const culprit = await page.evaluate((width) => {
        const wide = [...document.querySelectorAll("main *, header *, aside *")].filter((el) => el.getBoundingClientRect().right > width + 1 && !el.closest(".overflow-x-auto, .overflow-auto"));
        const el = wide[0];
        return el ? `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}` : "unknown";
      }, WIDTH);
      console.log(`✖ ${path}: ${overflow} px too wide, starting at ${culprit}`);
    } else {
      console.log(`✔ ${path}`);
    }
  }
  await context.close();
}
await browser.close();
console.log(failures ? `\n✖ ${failures} of ${checked} pages scroll sideways` : `\n✔ ${checked} pages fit at ${WIDTH} px`);
process.exit(failures ? 1 : 0);
