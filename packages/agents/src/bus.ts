import { Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@leadhunter/db";

const LITE = process.env.LITE_MODE === "true" || !process.env.REDIS_URL;

export const connection = LITE ? (null as any) : new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

function makeQueue(name: string): Queue {
  if (LITE) return { add: async () => { console.warn(`[lite] queue "${name}" disabled`); return null; }, name } as unknown as Queue;
  return new Queue(name, { connection });
}

export const orchestrationQueue = makeQueue("orchestration");
export const agentQueue = makeQueue("agent-run");
export const swarmQueue = makeQueue("swarm");

export type DomainEvent = { businessId: string; type: string; payload: Record<string, unknown> };

export async function publishEvent(evt: DomainEvent) {
  await prisma.event.create({ data: { businessId: evt.businessId, type: evt.type, payload: evt.payload as any } });
  await orchestrationQueue.add("event", evt, { removeOnComplete: true, removeOnFail: 500 });
}

export async function dispatchAgent(businessId: string, role: string, input: Record<string, unknown>, trigger = "event") {
  await agentQueue.add("run", { businessId, role, input, trigger }, { removeOnComplete: true });
}

export async function dispatchSwarm(businessId: string, task: string, repo?: string) {
  await swarmQueue.add("build", { businessId, task, repo }, { removeOnComplete: true });
}

export async function sendAgentMessage(businessId: string, fromRole: string, toRole: string, body: string, payload?: unknown, subject?: string) {
  await prisma.agentMessage.create({ data: { businessId, fromRole, toRole, body, subject, payload: payload as any } });
  await orchestrationQueue.add("agent_message", { businessId, fromRole, toRole, body, payload, subject }, { removeOnComplete: true });
}
