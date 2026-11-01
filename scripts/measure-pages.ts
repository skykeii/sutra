import { loadEnv, runScript } from "./lib/run";
import { demoCookie } from "./lib/session";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PAGES: [string, string][] = [
  ["aicte.admin", "/aicte"],
  ["aicte.admin", "/aicte/records"],
  ["admin.jntuh", "/university"],
  ["admin.deccan", "/institution"],
  ["aicte.admin", "/aicte/audit"],
];

// Measures until the server finishes streaming the HTML, which is the slow part of a signed-in page.
async function main() {
  loadEnv();
  const cookies = new Map<string, string>();
  for (const [handle] of PAGES) if (!cookies.has(handle)) cookies.set(handle, await demoCookie(handle));
  for (const [handle, path] of PAGES) {
    const times: number[] = [];
    for (let i = 0; i < 4; i++) {
      const start = performance.now();
      const res = await fetch(`${BASE}${path}`, { headers: { cookie: cookies.get(handle)! } });
      await res.text();
      if (i > 0) times.push(performance.now() - start); // The first request warms up the server.
    }
    const sorted = times.sort((a, b) => a - b);
    console.log(`${path.padEnd(16)} median ${Math.round(sorted[1]!)} ms, worst ${Math.round(sorted[2]!)} ms`);
  }
}

runScript(main);
