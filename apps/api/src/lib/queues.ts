import { getQueue, INLINE } from "@leadhunter/agents";

/**
 * Backed by Redis/BullMQ when REDIS_URL is set, otherwise by the in-process
 * runner (jobs execute inside this Node process — see packages/agents/src/jobqueue.ts).
 */
export const LITE = INLINE;
export const queues = {
  discovery: getQueue("discovery"),
  enrichment: getQueue("enrichment"),
  qualification: getQueue("qualification"),
  outreach: getQueue("outreach"),
  followup: getQueue("followup"),
  conversation: getQueue("conversation"),
  notify: getQueue("notify"),
  learning: getQueue("learning"),
};
