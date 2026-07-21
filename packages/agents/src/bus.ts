import { Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@leadhunter/db";

export const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null });

/** Every domain event is persisted (audit + Knowledge Brain source) and fanned
 *  out to the orchestrator queue, which decides which agents should react. */
export const orchestrationQueue = new Queue("orchestration", { connection });
export const agentQueue = new Queue("agent-run", { connection });
export const swarmQueue = new Queue("swarm", { connection });

export type DomainEvent = {
  businessId: string;
  type: string;      // e.g. "lead.qualified", "call.completed", "proposal.requested"
  payload: Record<string, unknown>;
};

export async function publishEvent(evt: DomainEvent) {
  await prisma.event.create({ data: { businessId: evt.businessId, type: evt.type, payload: evt.payload as any } });
  await orchestrationQueue.add("event", evt, { removeOnComplete: true, removeOnFail: 500 });
}

/** Fire-and-track an agent run (a "shift"). The agent-run worker executes it. */
export async function dispatchAgent(businessId: string, role: string, input: Record<string, unknown>, trigger = "event") {
  await agentQueue.add("run", { businessId, role, input, trigger }, { removeOnComplete: true });
}

export async function dispatchSwarm(businessId: string, task: string, repo?: string) {
  await swarmQueue.add("build", { businessId, task, repo }, { removeOnComplete: true });
}

/** One AI employee messages another (handled by orchestrator → dispatchAgent). */
export async function sendAgentMessage(businessId: string, fromRole: string, toRole: string, body: string, payload?: unknown, subject?: string) {
  await prisma.agentMessage.create({ data: { businessId, fromRole, toRole, body, subject, payload: payload as any } });
  await orchestrationQueue.add("agent_message", { businessId, fromRole, toRole, body, payload, subject }, { removeOnComplete: true });
}
