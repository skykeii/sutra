import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { FriendlyError, loadEnv, needEnv, ROOT, runScript } from "./lib/run";

function explainConnectionError(err: unknown): FriendlyError {
  const e = err as { code?: string; message?: string };
  const message = e.message ?? "";
  if (e.code === "ENOTFOUND" || e.code === "EAI_AGAIN") {
    return new FriendlyError("Could not find the database host. Check DATABASE_URL in .env.local and your internet connection.");
  }
  if (e.code === "28P01" || /password authentication failed/i.test(message)) {
    return new FriendlyError("The database rejected the password in DATABASE_URL. Check it in .env.local (special characters such as @ or # must be URL-encoded).");
  }
  if (/tenant or user not found/i.test(message)) {
    return new FriendlyError("Supabase did not recognise the DATABASE_URL user or region. Copy the session-pooler URI again from Supabase > Connect.");
  }
  if (e.code === "ETIMEDOUT" || e.code === "ECONNREFUSED" || e.code === "ENETUNREACH") {
    return new FriendlyError("Could not reach the database. Use the session-pooler URI from Supabase > Connect, and check that the project is not paused.");
  }
  return new FriendlyError(`Could not connect to the database: ${message}`);
}

async function main() {
  loadEnv();
  const connectionString = needEnv("DATABASE_URL");
  if (/\[YOUR-PASSWORD\]|YOUR_PASSWORD/i.test(connectionString)) {
    throw new FriendlyError("DATABASE_URL still contains the [YOUR-PASSWORD] placeholder. Replace it with your database password in .env.local.");
  }

  // Supabase pooler certificates do not chain to a public CA, so hostname pinning is not available here.
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
  } catch (err) {
    throw explainConnectionError(err);
  }

  try {
    await client.query(`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now());
                        alter table public._migrations enable row level security;
                        revoke all on public._migrations from anon, authenticated;`);
    const applied = new Set((await client.query<{ name: string }>("select name from public._migrations")).rows.map((r) => r.name));
    const dir = join(ROOT, "supabase", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      await client.query("begin");
      try {
        await client.query(readFileSync(join(dir, file), "utf8"));
        await client.query("insert into public._migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log(`• Applied ${file}`);
        ran += 1;
      } catch (err) {
        await client.query("rollback");
        throw new FriendlyError(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    console.log(ran ? `✔ Migrations: ${ran} applied` : "✔ Migrations: already up to date");
  } finally {
    await client.end();
  }
}

runScript(main);
