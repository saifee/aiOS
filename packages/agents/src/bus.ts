import { prisma } from "@leadhunter/db";
import { getQueue } from "./jobqueue";

export const orchestrationQueue = getQueue("orchestration");
export const agentQueue = getQueue("agent-run");
export const swarmQueue = getQueue("swarm");

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
