import { Worker, Queue } from "bullmq";
import { INLINE, redis } from "@leadhunter/agents";
import { processors, SCHEDULE } from "./registry";

/** Standalone worker process (Docker / Render with Redis). On Hostinger the API runs these inline instead. */
if (INLINE) {
  console.error("REDIS_URL is not set (or LITE_MODE=true): jobs already run inside the API process. Nothing to do here.");
  process.exit(0);
}

const connection = redis();
const concurrency: Record<string, number> = { outreach: 3, "agent-run": 4, swarm: 2 };
for (const [name, fn] of Object.entries(processors)) new Worker(name, fn as any, { connection, concurrency: concurrency[name] ?? 5 });

// Recurring autonomous loops — one BullMQ repeatable job per entry in SCHEDULE
const CRON: Record<string, string> = {
  "followup-scan": "*/30 * * * *", "discover-all": "0 */6 * * *", learning: "0 2 * * *",
  "growth-scan": "0 6 * * *", "morning-brief": "0 7 * * *", "social-publish": "*/5 * * * *",
};
(async () => {
  for (const [key, s] of Object.entries(SCHEDULE)) {
    await new Queue(s.queue, { connection }).add(s.job, {}, { repeat: { pattern: CRON[key] }, removeOnComplete: true });
  }
  console.log("aiOS workers online — autonomous loops scheduled.");
})().catch(console.error);
