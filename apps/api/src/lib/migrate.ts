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

const PLAN_ENUM = "ENUM('TRIAL','STARTER','GROWTH','SCALE','ENTERPRISE','FREE')";
const PATCHES = [
  `ALTER TABLE \`Tenant\` MODIFY \`plan\` ${PLAN_ENUM} NOT NULL DEFAULT 'FREE'`,
  `ALTER TABLE \`Subscription\` MODIFY \`plan\` ${PLAN_ENUM} NOT NULL DEFAULT 'TRIAL'`,
];

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
    // Upgrades from earlier versions: extend the Plan ENUM in place (idempotent; ignored if already applied)
    for (const sql of PATCHES) await prisma.$executeRawUnsafe(sql).catch(() => {});
    log.info(`Database ready (${statements.length} statements).`);
  } catch (e: any) {
    log.error(`Migration failed (app will still start): ${String(e.stderr || e.message).slice(-600)}`);
  }
}

/**
 * Runs on every start (unless AUTO_SCHEMA=false). Creates any table that is missing, using the shipped schema.sql
 * (CREATE TABLE IF NOT EXISTS, so existing data is never touched). This is what repairs an older database that
 * predates newer features, e.g. "The table `AiKey` does not exist in the current database".
 */
export async function ensureSchema(log: Log) {
  if (process.env.AUTO_SCHEMA === "false") return;
  try {
    const file = findSchemaSql();
    if (!file) { log.error("ensureSchema: schema.sql not found; tables were not checked."); return; }
    const statements = readFileSync(file, "utf8").split("\n").filter((l) => !l.startsWith("--")).join("\n").split(/;\s*\n/).map((s) => s.trim()).filter((s) => /^CREATE TABLE IF NOT EXISTS/i.test(s));
    let failed = 0;
    for (const sql of statements) await prisma.$executeRawUnsafe(sql).catch((e: any) => { failed++; log.error(`ensureSchema: ${sql.slice(0, 60)}… failed: ${String(e.message).slice(0, 200)}`); });
    for (const sql of PATCHES) await prisma.$executeRawUnsafe(sql).catch(() => {});
    log.info(`Database schema checked (${statements.length} tables${failed ? `, ${failed} failed` : ""}).`);
  } catch (e: any) {
    log.error(`ensureSchema failed (app will still start): ${String(e.message).slice(0, 300)}`);
  }
}
