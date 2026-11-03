import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { hmacMatch } from "../lib/crypto";
import { adminClient, loadEnv, needEnv } from "../scripts/lib/run";

const DEMO_APAAR = "900000000010";
const PURPOSE = "Pre-employment verification";

async function signIn(browser: Browser, handle: string, landing: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(`${handle}@sutra.example`);
  await page.getByLabel("Password").fill("Demo@12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`**${landing}`);
  return page;
}

// Writes a consent, an SMS, a notification and an access entry, and deletes all of them afterwards.
test.describe("employer verification with consent", () => {
  test.skip(!process.env.E2E_ALLOW_WRITES, "Set E2E_ALLOW_WRITES=1 to run tests that write data");

  test("a new request, the student's approval, one view, and the student's access log", async ({ browser }) => {
    loadEnv();
    const db = adminClient();
    const student = (await db.from("students").select("id").eq("apaar_hash", hmacMatch(DEMO_APAAR)).single()).data!;
    const started = new Date();
    let consentId = "";
    try {
      // After a reset the demo student has nothing approved or used, and the employer sees no verified row.
      const { data: used } = await db.from("consents").select("id").eq("student_id", student.id).or("approved_at.not.is.null,consumed_at.not.is.null");
      expect(used).toEqual([]);
      const verifier = await signIn(browser, "verifier.navayuga", "/verifier");
      await verifier.goto("/verifier/requests");
      await expect(verifier.getByText("Verified ✓")).toHaveCount(0);

      // The student's page is already open, so the request must arrive without a reload.
      const studentPage = await signIn(browser, "student10", "/student");
      await studentPage.goto("/student/consents");
      await expect(studentPage.getByText("Live", { exact: true })).toBeVisible({ timeout: 20_000 });

      await verifier.goto("/verifier");
      await verifier.getByLabel("APAAR ID or QR link").fill(DEMO_APAAR);
      await verifier.getByLabel("Why do you need this?").fill(PURPOSE);
      const asked = verifier.waitForResponse((r) => r.url().endsWith("/api/app/verifier/request"));
      await verifier.getByRole("button", { name: "Ask the student for consent" }).click();
      consentId = ((await (await asked).json()) as { consentId: string }).consentId;
      const { data: consent } = await db.from("consents").select("created_at, seeded").eq("id", consentId).single();
      expect(consent!.seeded).toBe(false);
      expect(new Date(consent!.created_at).getTime()).toBeGreaterThanOrEqual(started.getTime() - 5_000);

      const waiting = studentPage.locator("main li", { hasText: "Navayuga Software Services" });
      await expect(waiting).toBeVisible({ timeout: 15_000 });
      await waiting.getByRole("button", { name: "Approve with a code" }).click();
      const newest = studentPage.getByText(/consent code is \d{6}/).first();
      await expect(newest).toContainText("Pre-employment verification", { timeout: 15_000 });
      const code = /consent code is (\d{6})/.exec(await newest.innerText())![1]!;
      await studentPage.getByLabel("Code from the simulated SMS inbox").fill(code);
      await studentPage.getByRole("button", { name: "Confirm" }).click();
      await expect(studentPage.getByText("No requests are waiting for you.")).toBeVisible({ timeout: 15_000 });

      await verifier.goto("/verifier/requests");
      const row = verifier.locator("tr", { hasText: consentId });
      await row.getByRole("button", { name: "View result (one time)" }).click();
      await expect(row.getByText(/Verified ✓: B\.Tech Computer Science & Engineering \(CSE\), Yamuna Institute of Technology, 2024-2028, Active/)).toBeVisible();
      const again = await verifier.request.post(`/api/app/verifier/view/${consentId}`);
      expect(again.status()).toBe(409);
      const receipt = await verifier.request.get(`/api/app/verifier/receipt/${consentId}`);
      expect(receipt.headers()["content-type"]).toContain("application/pdf");
      const { data: logged } = await db.from("access_log").select("grantee, purpose, fields_returned").eq("consent_id", consentId);
      expect(logged).toEqual([{ grantee: "Navayuga Software Services", purpose: PURPOSE, fields_returned: ["verified", "institution", "program", "years", "status"] }]);

      // Arrives live, and is still there after a reload.
      const accessed = studentPage.locator("main tr", { hasText: "verified, institution, program, years, status" });
      await expect(accessed.filter({ hasText: "Navayuga Software Services" })).toBeVisible({ timeout: 15_000 });
      await studentPage.reload();
      await expect(accessed.filter({ hasText: "Navayuga Software Services" })).toBeVisible();
      const requestRow = studentPage.locator("main tr", { hasText: "Navayuga Software Services", hasNotText: "verified, institution" });
      await expect(requestRow.getByText("Used once")).toBeVisible();
      await expect(requestRow.getByRole("button", { name: "Take back access" })).toHaveCount(0);

      // Another student cannot read the entry.
      const other = createClient(needEnv("NEXT_PUBLIC_SUPABASE_URL"), needEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
      await other.auth.signInWithPassword({ email: "student1@sutra.example", password: "Demo@12345" });
      expect((await other.from("access_log").select("id").eq("consent_id", consentId)).data).toEqual([]);
      const owner = createClient(needEnv("NEXT_PUBLIC_SUPABASE_URL"), needEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
      await owner.auth.signInWithPassword({ email: "student10@sutra.example", password: "Demo@12345" });
      expect((await owner.from("access_log").select("id").eq("consent_id", consentId)).data).toHaveLength(1);
    } finally {
      const since = started.toISOString();
      if (consentId) {
        await db.from("access_log").delete().eq("consent_id", consentId);
        await db.from("consents").delete().eq("id", consentId);
      }
      await db.from("access_log").delete().eq("student_id", student.id).eq("seeded", false).gte("created_at", since);
      await db.from("simulated_sms").delete().eq("student_id", student.id).gte("created_at", since);
      const { data: owner } = await db.from("profiles").select("user_id").eq("apaar_hash", hmacMatch(DEMO_APAAR)).single();
      await db.from("notifications").delete().eq("user_id", owner!.user_id).gte("created_at", since);
    }
  });
});
