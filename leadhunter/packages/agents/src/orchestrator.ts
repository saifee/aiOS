import { dispatchAgent } from "./bus";

/**
 * Event-driven routing. When a domain event fires, the orchestrator decides
 * which department agents should wake up. This is the "nervous system" that
 * makes departments collaborate without hard-coding every handoff.
 */
const ROUTES: Record<string, { role: string; input: (p: any) => Record<string, unknown> }[]> = {
  "lead.qualified":      [{ role: "sales", input: (p) => ({ task: "New qualified lead — engage and move toward a demo.", leadId: p.leadId }) }],
  "call.completed":      [{ role: "executive_reporting", input: (p) => ({ task: "Log this completed call in the morning brief.", callId: p.callId }) }],
  "proposal.accepted":   [
                           { role: "customer_success", input: (p) => ({ task: "Client accepted — start onboarding.", leadId: p.leadId }) },
                           { role: "finance", input: (p) => ({ task: "Raise the initial invoice for this won deal.", leadId: p.leadId, amount: p.amount }) },
                           { role: "project_manager", input: (p) => ({ task: "Spin up a delivery project for this new client.", leadId: p.leadId }) },
                         ],
  "invoice.overdue":     [{ role: "finance", input: (p) => ({ task: "Chase this overdue invoice.", invoiceId: p.invoiceId }) }],
  "project.at_risk":     [{ role: "project_manager", input: (p) => ({ task: "This project is at risk — diagnose and propose recovery, notify owner.", projectId: p.projectId }) }],
  "opportunity.found":   [{ role: "sales", input: (p) => ({ task: "Growth agent found an opportunity — qualify and pursue.", ...p }) }],
  "churn.risk":          [{ role: "customer_success", input: (p) => ({ task: "Churn risk detected — intervene and notify owner.", leadId: p.leadId }) }],
};

export function routeEvent(type: string, payload: any): { role: string; input: Record<string, unknown> }[] {
  return (ROUTES[type] ?? []).map((r) => ({ role: r.role, input: r.input(payload) }));
}

export async function handleEvent(businessId: string, type: string, payload: any) {
  for (const { role, input } of routeEvent(type, payload)) await dispatchAgent(businessId, role, input, "event");
}

/** Deliver an inter-agent message by waking the recipient agent. */
export async function handleAgentMessage(businessId: string, msg: { fromRole: string; toRole: string; body: string; payload?: unknown; subject?: string }) {
  await dispatchAgent(businessId, msg.toRole, { task: `Message from ${msg.fromRole}: ${msg.body}`, from: msg.fromRole, payload: msg.payload }, "agent_message");
}
