import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

try {
  const { chromium } = await import("@playwright/test");
  await (await chromium.launch()).close();
} catch {
  console.log("Skipping browser tests: Playwright's Chromium is not available. Run: npx playwright install chromium");
  process.exit(0);
}
const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
try {
  await fetch(base);
} catch {
  console.error(`The app is not running at ${base}. Start it with: npm run start`);
  process.exit(1);
}
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("@playwright/test/package.json")), "cli.js");
process.exit(spawnSync(process.execPath, [cli, "test"], { stdio: "inherit" }).status ?? 1);
