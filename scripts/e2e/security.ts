import { rlsTest } from "../rls-test";
import { call, check, pages } from "./helpers";

export async function security() {
  console.log("\nAudit and security");
  await pages("aicte.admin", ["/aicte/audit", "/aicte/audit?action=upload", "/settings/security"]);
  await pages(null, ["/transparency", "/privacy"]);
  await pages("student1", ["/settings/security"]);

  const intact = await call("aicte.officer", "/api/app/audit/verify", {});
  check("integrity check passes", intact.json?.ok === true, `${intact.json?.count} entries`);
  check("an officer cannot tamper", (await call("aicte.officer", "/api/app/audit/tamper", {})).status === 403);
  check("a college cannot run the integrity check", (await call("admin.deccan", "/api/app/audit/verify", {})).status === 403);

  const tampered = await call("aicte.admin", "/api/app/audit/tamper", { seq: 50 });
  check("demo tamper runs", tampered.json?.seq === 50, JSON.stringify(tampered.json));
  const caught = await call("aicte.admin", "/api/app/audit/verify", {});
  check("tampering is detected at the exact entry", caught.json?.ok === false && caught.json?.brokenAt === 50, `broken at ${caught.json?.brokenAt}`);
  check("restore runs", (await call("aicte.admin", "/api/app/audit/restore", {})).json?.ok === true);
  const restored = await call("aicte.admin", "/api/app/audit/verify", {});
  check("chain is intact after restore", restored.json?.ok === true, `${restored.json?.count} entries`);
  check("integrity badge shows the result", /chain intact/.test((await call("aicte.admin", "/aicte")).text));

  const anchor = await call("aicte.admin", "/api/app/audit/anchor", {});
  check("anchor created", anchor.json?.ok === true);
  const hash = anchor.json?.anchor?.last_hash as string;
  check("pasted anchor hash matches", /Matches the anchor/.test((await call(null, `/transparency?hash=${hash}`)).text));
  check("unknown hash does not match", /does not match/.test((await call(null, `/transparency?hash=${"0".repeat(64)}`)).text));

  const headers = (await call(null, "/login")).headers;
  for (const name of ["content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "strict-transport-security"]) {
    check(`header ${name} is set`, !!headers.get(name));
  }
  const crossSite = await call("aicte.admin", "/api/app/audit/verify", {}, { origin: "https://evil.example" });
  check("cross-site POST is refused", crossSite.status === 403, String(crossSite.status));
  const broken = await call("admin.deccan", "/api/app/upload", { programId: "not-a-uuid" });
  check("bad input gets a clean error, no stack trace", broken.status === 400 && !!broken.json?.error?.code && !/\bat .*\(/.test(broken.text));

  console.log("\nRow-level security");
  await rlsTest(check);
}
