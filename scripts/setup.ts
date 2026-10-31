import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ROOT } from "./lib/run";

// Each step gets its own process, so later steps read the keys the first one wrote.
for (const step of ["keys", "migrate", "seed"]) {
  console.log(`\n▶ ${step}`);
  const result = spawnSync(process.execPath, ["--import", "tsx", join(ROOT, "scripts", `${step}.ts`)], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`\nSetup stopped at "${step}". Fix the message above, then run: npm run setup`);
    process.exit(1);
  }
}
console.log("\n✔ Setup complete. Start the app with: npm run dev");
