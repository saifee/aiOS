import { registerProcessor, withLlmContext } from "@leadhunter/agents";
import { prisma } from "@leadhunter/db";
import { discoveryProcessor } from "./workers/discovery";
import { enrichmentProcessor } from "./workers/enrichment";
import { qualificationProcessor } from "./workers/qualification";
import { outreachProcessor } from "./workers/outreach";
import { followupProcessor } from "./workers/followup";
import { conversationProcessor } from "./workers/conversation";
import { notifyProcessor } from "./workers/notify";
import { learningProcessor } from "./workers/learning";
import { agentRunProcessor } from "./workers/agentrun";
import { orchestrationProcessor } from "./workers/orchestration";
import { execProcessor } from "./workers/exec";
import { socialProcessor } from "./workers/social";
import { swarmProcessor } from "./workers/swarm";

/** Run a job inside its workspace's AI context so it uses that workspace's keys/plan. */
async function tenantOf(d: any): Promise<string | undefined> {
  try {
    if (d?.businessId) return (await prisma.business.findUnique({ where: { id: d.businessId }, select: { tenantId: true } }))?.tenantId;
    if (d?.leadId) return (await prisma.lead.findUnique({ where: { id: d.leadId }, select: { business: { select: { tenantId: true } } } }))?.business.tenantId;
  } catch { /* fall through to system context */ }
  return undefined;
}
const scoped = <F extends (job: any) => Promise<any>>(fn: F): F =>
  (async (job: any) => { const tenantId = await tenantOf(job?.data); return tenantId ? withLlmContext({ tenantId }, () => fn(job)) : fn(job); }) as F;

const raw = {
  discovery: discoveryProcessor, enrichment: enrichmentProcessor, qualification: qualificationProcessor,
  outreach: outreachProcessor, followup: followupProcessor, conversation: conversationProcessor,
  notify: notifyProcessor, learning: learningProcessor, "agent-run": agentRunProcessor,
  orchestration: orchestrationProcessor, exec: execProcessor, social: socialProcessor, swarm: swarmProcessor,
} as const;
export const processors = Object.fromEntries(Object.entries(raw).map(([k, f]) => [k, scoped(f as any)])) as typeof raw;

/** Inline mode: attach every processor to the in-process queue. */
export function registerInlineProcessors() {
  for (const [name, fn] of Object.entries(processors)) registerProcessor(name, fn as any);
}

/** Named recurring jobs (same cadence as the Redis cron schedule). Used by /v1/cron and the optional in-process timer. */
export const SCHEDULE: Record<string, { queue: string; job: string; everyMin: number }> = {
  "followup-scan": { queue: "followup", job: "scan", everyMin: 30 },
  "discover-all": { queue: "discovery", job: "discover-all", everyMin: 360 },
  "learning": { queue: "learning", job: "recompute", everyMin: 1440 },
  "growth-scan": { queue: "exec", job: "growth-scan", everyMin: 1440 },
  "morning-brief": { queue: "exec", job: "morning-brief", everyMin: 1440 },
  "social-publish": { queue: "social", job: "publish-due", everyMin: 5 },
};
