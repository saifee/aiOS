import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
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

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null });
const opts = { connection, concurrency: 5 };

new Worker("discovery", discoveryProcessor, opts);
new Worker("enrichment", enrichmentProcessor, opts);
new Worker("qualification", qualificationProcessor, opts);
new Worker("outreach", outreachProcessor, { ...opts, concurrency: 3 });
new Worker("followup", followupProcessor, opts);
new Worker("conversation", conversationProcessor, opts);
new Worker("notify", notifyProcessor, opts);
new Worker("learning", learningProcessor, opts);
new Worker("agent-run", agentRunProcessor, { ...opts, concurrency: 4 });
new Worker("orchestration", orchestrationProcessor, opts);
new Worker("exec", execProcessor, opts);

// ── Recurring autonomous loops ────────────────────────────────
async function scheduleCrons() {
  const discovery = new Queue("discovery", { connection });
  const followup = new Queue("followup", { connection });
  const learning = new Queue("learning", { connection });
  // Discover new leads for every active campaign every 6 hours
  await discovery.add("discover-all", {}, { repeat: { pattern: "0 */6 * * *" }, removeOnComplete: true });
  // Check due follow-ups every 30 minutes
  await followup.add("scan", {}, { repeat: { pattern: "*/30 * * * *" }, removeOnComplete: true });
  // Recompute learning insights nightly
  await learning.add("recompute", {}, { repeat: { pattern: "0 2 * * *" }, removeOnComplete: true });
}
async function scheduleExec() {
  const exec = new Queue("exec", { connection });
  await exec.add("growth-scan", {}, { repeat: { pattern: "0 6 * * *" }, removeOnComplete: true });
  await exec.add("morning-brief", {}, { repeat: { pattern: "0 7 * * *" }, removeOnComplete: true });
}
scheduleExec().catch(console.error);
scheduleCrons().then(() => console.log("LeadHunter workers online — autonomous loops scheduled."));
