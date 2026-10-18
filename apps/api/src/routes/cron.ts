import { FastifyInstance } from "fastify";
import { timingSafeEqual } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getQueue } from "@leadhunter/agents";
import { SCHEDULE } from "../../../workers/src/registry";
import { runDailyBriefings } from "../lib/chief";

const STATE_FILE = process.env.CRON_STATE_FILE || join(process.cwd(), ".cron-state.json");
let state: Record<string, number> = {};
try { state = JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { /* first run */ }
const save = () => { try { writeFileSync(STATE_FILE, JSON.stringify(state)); } catch { /* read-only FS: in-memory only */ } };

/** Run every recurring job whose interval has elapsed. Safe to call as often as you like. */
export async function cronTick(only?: string): Promise<string[]> {
  const ran: string[] = [];
  const now = Date.now();
  for (const [key, s] of Object.entries(SCHEDULE)) {
    if (only && only !== key) continue;
    if (!only && now - (state[key] ?? 0) < s.everyMin * 60_000) continue;
    state[key] = now;
    await getQueue(s.queue).add(s.job, {});
    ran.push(key);
  }
  if (!only || only === "briefings") {
    // Cheap check (one query); sends each opted-in user their briefing once a day.
    if (only || now - (state.briefings ?? 0) >= 10 * 60_000) { state.briefings = now; if ((await runDailyBriefings().catch(() => 0)) > 0) ran.push("briefings"); }
  }
  if (ran.length) save();
  return ran;
}

function authorized(given: unknown): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || typeof given !== "string") return false;
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * External scheduler endpoint — for hosts that cannot keep a worker alive.
 * Add ONE cron job in the host panel, every 5 minutes:
 *   curl -fsS -H "x-cron-key: $CRON_SECRET" "https://YOUR-DOMAIN/v1/cron/tick"   (header preferred: URLs end up in logs)
 * ?key= is still accepted for hosts that cannot send headers; the logger redacts it.
 */
export async function cronRoutes(app: FastifyInstance) {
  app.all("/cron/tick", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const q = req.query as any;
    if (!authorized(req.headers["x-cron-key"] ?? q.key)) return reply.code(401).send({ error: "bad key" });
    const ran = await cronTick(typeof q.job === "string" ? q.job : undefined);
    return { ok: true, started: ran };
  });
}

/** Optional in-process timer (used when the host keeps the Node process alive). */
export function startInlineScheduler() {
  if (process.env.INLINE_SCHEDULER === "false") return;
  setInterval(() => { cronTick().catch((e) => console.error("[cron]", e?.message ?? e)); }, 60_000).unref?.();
}
