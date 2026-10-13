import { execFile } from "child_process";
import { promisify } from "util";
import { resolve } from "path";
const run = promisify(execFile);

/** AUTO_MIGRATE=true: create/upgrade tables on boot (idempotent `prisma db push`). Failures are logged, not fatal. */
export async function runMigrations(log: { info: (m: string) => void; error: (m: string) => void }) {
  try {
    log.info("Running database migration…");
    const { stdout } = await run("npm", ["-w", "packages/db", "run", "migrate"], { cwd: resolve(__dirname, "../../.."), env: process.env, timeout: 240_000 });
    log.info(stdout.split("\n").slice(-6).join(" | "));
  } catch (e: any) {
    log.error(`Migration failed (app will still start): ${String(e.stderr || e.message).slice(-600)}`);
  }
}
