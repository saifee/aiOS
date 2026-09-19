import { Queue } from "bullmq";
import IORedis from "ioredis";

/**
 * Queues are optional. In LITE_MODE (or when REDIS_URL is unset) we skip Redis
 * entirely: the API still boots and serves everything that runs synchronously
 * (CRM, analytics, Command Center, agent runs, swarm, image gen). Background
 * jobs (discovery, outreach, schedules) simply no-op with a log line.
 */
export const LITE = process.env.LITE_MODE === "true" || !process.env.REDIS_URL;

export const connection = LITE
  ? (null as any)
  : new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

function makeQueue(name: string): Queue {
  if (LITE) {
    return {
      add: async () => { console.warn(`[lite] background queue "${name}" is disabled (no Redis) — skipped.`); return null; },
      name,
    } as unknown as Queue;
  }
  return new Queue(name, { connection });
}

export const queues = {
  discovery: makeQueue("discovery"),
  enrichment: makeQueue("enrichment"),
  qualification: makeQueue("qualification"),
  outreach: makeQueue("outreach"),
  followup: makeQueue("followup"),
  conversation: makeQueue("conversation"),
  notify: makeQueue("notify"),
  learning: makeQueue("learning"),
};
