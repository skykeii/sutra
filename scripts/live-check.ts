import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_PASSWORD, demoEmail } from "@/lib/demo-accounts";

// Read-only check of a public address: npm run live-check -- https://sutra.teentechindia.com
const BASE = (process.argv[2] ?? "https://sutra.teentechindia.com").replace(/\/+$/, "");
const ROOT = join(__dirname, "..");
const results: { name: string; ok: boolean; detail: string }[] = [];
const record = (name: string, ok: boolean, detail = "") => results.push({ name, ok, detail });
const FORBIDDEN = /localhost|trycloudflare|vercel\.app/i;

async function page(path: string) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
  return { res, text: await res.text() };
}

async function login(email: string) {
  const html = await (await fetch(`${BASE}/login`)).text();
  const form = new FormData();
  for (const m of html.matchAll(/<input type="hidden" name="(\$ACTION[^"]*)"(?: value="([^"]*)")?/g)) form.append(m[1]!, (m[2] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  form.append("email", email);
  form.append("password", DEMO_PASSWORD);
  return fetch(`${BASE}/login`, { method: "POST", body: form, redirect: "manual", headers: { origin: BASE } });
}

async function medianMs(path: string, headers: Record<string, string> = {}) {
  const times: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const start = performance.now();
    await (await fetch(`${BASE}${path}`, { headers, redirect: "manual" })).text();
    times.push(Math.round(performance.now() - start));
  }
  return times.sort((a, b) => a - b)[1]!;
}

async function main() {
  for (const path of ["/", "/login", "/verify", "/transparency", "/docs", "/privacy", "/portal-demo", "/api/v1/public-key", "/.well-known/aicte-public-key.json"]) {
    const { res, text } = await page(path);
    record(`GET ${path}`, res.status === 200, String(res.status));
    if (!path.includes("public-key")) {
      const hit = FORBIDDEN.exec(text)?.[0];
      record(`${path} names no other address`, !hit, hit ?? "");
    }
  }

  const valid = await page("/verify/SUTRA-DEMO-VALID");
  record("VALID credential page", valid.res.status === 200 && />VALID</.test(valid.text));
  record("VALID page names no other address", !FORBIDDEN.test(valid.text), FORBIDDEN.exec(valid.text)?.[0] ?? "");
  const revoked = await page("/verify/SUTRA-DEMO-REVOKED");
  record("REVOKED credential page", revoked.res.status === 200 && /REVOKED/.test(revoked.text));

  for (const file of ["valid_credential.json", "forged_credential.json"]) {
    const text = readFileSync(join(ROOT, "demo-files", file), "utf8");
    const hit = FORBIDDEN.exec(text)?.[0];
    record(`${file} names no other address`, !hit, hit ?? "");
    const check = await fetch(`${BASE}/api/app/public/verify-json`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: text });
    const verdict = ((await check.json()) as { verdict?: string }).verdict;
    const expected = file.startsWith("valid") ? "VALID" : "TAMPERED";
    record(`${file} shows ${expected}`, verdict === expected, String(verdict));
  }

  const signedIn = await login(demoEmail("aicte.admin"));
  const cookies = signedIn.headers.getSetCookie().filter((c) => c.startsWith("sb-"));
  record("login works for a demo account", signedIn.status === 303 && signedIn.headers.get("location") === "/aicte", `${signedIn.status} ${signedIn.headers.get("location")}`);
  record("session cookies are Secure, HttpOnly and SameSite", cookies.length > 0 && cookies.every((c) => /;\s*secure/i.test(c) && /;\s*httponly/i.test(c) && /;\s*samesite=/i.test(c)), `${cookies.length} cookie(s)`);
  const cookie = cookies.map((c) => c.split(";")[0]).join("; ");

  const headers = (await fetch(`${BASE}/login`)).headers;
  for (const name of ["strict-transport-security", "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"]) {
    record(`header ${name}`, !!headers.get(name));
  }

  const timings: string[] = [];
  const medians: number[] = [];
  for (const [path, extra] of [["/", {}], ["/login", {}], ["/verify/SUTRA-DEMO-VALID", {}], ["/aicte", { cookie }], ["/aicte/records", { cookie }]] as const) {
    const ms = await medianMs(path, extra);
    medians.push(ms);
    timings.push(`${path} ${ms} ms`);
  }
  const overall = [...medians].sort((a, b) => a - b)[2]!;
  record("median response time for 5 pages", overall < 5000, `${overall} ms (${timings.join(", ")})`);

  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(width)}  ${r.detail}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} of ${results.length} checks failed at ${BASE}` : `\nAll ${results.length} checks passed at ${BASE}`);
  if (failed) process.exit(1);
}

void main();
