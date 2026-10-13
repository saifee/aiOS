import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { prisma } from "@leadhunter/db";
const run = promisify(execFile);

type Log = { info: (m: string) => void; error: (m: string) => void };
const root = resolve(__dirname, "../../..");

function findSchemaSql(): string | null {
  for (const p of [process.env.SCHEMA_SQL, join(__dirname, "schema.sql"), join(root, "schema.sql"), join(root, "packages/db/prisma/schema.sql")])
    if (p && existsSync(p)) return p;
  return null;
}

/**
 * AUTO_MIGRATE=true: create the tables on boot. Idempotent; failures are logged, never fatal.
 *  - Prisma CLI installed (dev / Docker)  -> `prisma db push` (also adds new columns later)
 *  - No CLI (prebuilt Hostinger package)  -> run the shipped schema.sql (CREATE TABLE IF NOT EXISTS)
 */
export async function runMigrations(log: Log) {
  try {
    const cli = existsSync(join(root, "node_modules/.bin/prisma"));
    if (cli) {
      log.info("Running database migration (prisma db push)…");
      const { stdout } = await run("npm", ["-w", "packages/db", "run", "migrate"], { cwd: root, env: process.env, timeout: 240_000 });
      log.info(stdout.split("\n").slice(-6).join(" | "));
      return;
    }
    const file = findSchemaSql();
    if (!file) throw new Error("schema.sql not found (set SCHEMA_SQL or run the SQL from docs/HOSTINGER-CLOUD.md manually)");
    log.info(`Running database migration from ${file}…`);
    const statements = readFileSync(file, "utf8").split("\n").filter((l) => !l.startsWith("--")).join("\n").split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
    for (const sql of statements) await prisma.$executeRawUnsafe(sql);
    log.info(`Database ready (${statements.length} statements).`);
  } catch (e: any) {
    log.error(`Migration failed (app will still start): ${String(e.stderr || e.message).slice(-600)}`);
  }
}
