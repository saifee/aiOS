import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { prisma } from "@leadhunter/db";
import { sendEmail, sendWhatsAppText, notifySlack } from "@leadhunter/integrations";
import { searchKnowledge } from "./memory";
import { sendAgentMessage, publishEvent } from "./bus";

export type ToolCtx = { businessId: string; agentRole: string };
export type Tool = { name: string; description: string; schema: z.ZodType<any>; handler: (input: any, ctx: ToolCtx) => Promise<unknown>; sensitive?: boolean };

/** Human-approval gate: sensitive actions create an Approval row instead of
 *  executing, and only run once a human approves. */
async function requireApproval(ctx: ToolCtx, action: string, summary: string, payload: unknown) {
  const a = await prisma.approval.create({ data: { businessId: ctx.businessId, agentRole: ctx.agentRole, action, summary, payload: payload as any } });
  return { status: "awaiting_approval", approvalId: a.id, note: "Queued for human approval." };
}

export const TOOLS: Record<string, Tool> = {
  search_crm: {
    name: "search_crm",
    description: "Search leads/companies in the CRM by name, stage, or minimum score.",
    schema: z.object({ query: z.string().optional(), stage: z.string().optional(), minScore: z.number().optional(), take: z.number().max(50).default(20) }),
    handler: async (i, ctx) => prisma.lead.findMany({
      where: { businessId: ctx.businessId, ...(i.query && { companyName: { contains: i.query, mode: "insensitive" } }), ...(i.stage && { stage: i.stage }), ...(i.minScore && { leadScore: { gte: i.minScore } }) },
      include: { contacts: true }, take: i.take, orderBy: { leadScore: "desc" },
    }),
  },
  get_lead: {
    name: "get_lead", description: "Get full detail + history for one lead by id.",
    schema: z.object({ leadId: z.string() }),
    handler: async (i) => prisma.lead.findUnique({ where: { id: i.leadId }, include: { contacts: true, activities: { orderBy: { createdAt: "desc" }, take: 30 }, messages: { orderBy: { createdAt: "asc" } }, meetings: true } }),
  },
  create_lead: {
    name: "create_lead", description: "Create a new lead/company record.",
    schema: z.object({ companyName: z.string(), website: z.string().optional(), city: z.string().optional(), country: z.string().optional(), phones: z.array(z.string()).default([]), emails: z.array(z.string()).default([]) }),
    handler: async (i, ctx) => prisma.lead.create({ data: { businessId: ctx.businessId, dedupeKey: i.website ?? i.companyName.toLowerCase(), ...i } }),
  },
  set_lead_stage: {
    name: "set_lead_stage", description: "Move a lead to a CRM stage.",
    schema: z.object({ leadId: z.string(), stage: z.enum(["FOUND","QUALIFIED","CONTACTED","REPLIED","INTERESTED","MEETING_SCHEDULED","PROPOSAL_SENT","NEGOTIATION","WON","LOST","ARCHIVED"]) }),
    handler: async (i) => prisma.lead.update({ where: { id: i.leadId }, data: { stage: i.stage as any } }),
  },
  log_activity: {
    name: "log_activity", description: "Append an activity/note to a lead's timeline.",
    schema: z.object({ leadId: z.string(), type: z.string(), detail: z.any().optional() }),
    handler: async (i, ctx) => prisma.activity.create({ data: { leadId: i.leadId, type: i.type, detail: i.detail, actor: `agent:${ctx.agentRole}` } }),
  },
  search_knowledge: {
    name: "search_knowledge", description: "Semantic search across everything the company knows (emails, calls, projects, contracts, client history).",
    schema: z.object({ query: z.string(), limit: z.number().max(12).default(6) }),
    handler: async (i, ctx) => searchKnowledge(ctx.businessId, i.query, i.limit),
  },
  send_email: {
    name: "send_email", description: "Send an email to a contact.",
    schema: z.object({ to: z.string(), subject: z.string(), html: z.string() }),
    handler: async (i, ctx) => sendEmail({ to: i.to, subject: i.subject, html: i.html, from: process.env.DEFAULT_FROM_EMAIL ?? "hello@leadhunter.app", unsubscribeUrl: `${process.env.APP_URL}/u/x` }),
  },
  send_whatsapp: {
    name: "send_whatsapp", description: "Send a WhatsApp message (only inside an open 24h session).",
    schema: z.object({ to: z.string(), body: z.string() }),
    handler: async (i) => sendWhatsAppText(i.to, i.body),
  },
  book_meeting: {
    name: "book_meeting", description: "Create a meeting on a lead's record.",
    schema: z.object({ leadId: z.string(), startsAt: z.string(), endsAt: z.string().optional(), joinUrl: z.string().optional() }),
    handler: async (i) => { const m = await prisma.meeting.create({ data: { leadId: i.leadId, provider: "calcom", startsAt: new Date(i.startsAt), endsAt: new Date(i.endsAt ?? i.startsAt), joinUrl: i.joinUrl } }); await prisma.lead.update({ where: { id: i.leadId }, data: { stage: "MEETING_SCHEDULED" } }); return m; },
  },
  create_task: {
    name: "create_task", description: "Create a task, optionally assigned to a person or another agent.",
    schema: z.object({ title: z.string(), assignee: z.string().optional(), projectId: z.string().optional(), priority: z.enum(["low","medium","high"]).default("medium"), dueDate: z.string().optional() }),
    handler: async (i, ctx) => prisma.task.create({ data: { businessId: ctx.businessId, title: i.title, assignee: i.assignee, projectId: i.projectId, priority: i.priority, dueDate: i.dueDate ? new Date(i.dueDate) : undefined } }),
  },
  create_proposal: {
    name: "create_proposal", description: "Draft a proposal for a lead (draft only — sending is gated).",
    schema: z.object({ leadId: z.string().optional(), title: z.string(), packageName: z.string().optional(), amount: z.number().optional(), currency: z.string().default("SAR"), contentHtml: z.string().optional() }),
    handler: async (i, ctx) => prisma.proposal.create({ data: { businessId: ctx.businessId, ...i } }),
  },
  create_invoice: {
    name: "create_invoice", description: "Create an invoice draft.",
    schema: z.object({ leadId: z.string().optional(), number: z.string(), amount: z.number(), currency: z.string().default("SAR"), dueDate: z.string().optional() }),
    handler: async (i, ctx) => prisma.invoice.create({ data: { businessId: ctx.businessId, ...i, dueDate: i.dueDate ? new Date(i.dueDate) : undefined } }),
  },
  message_agent: {
    name: "message_agent", description: "Send a message/task to another department's AI agent.",
    schema: z.object({ toRole: z.string(), body: z.string(), subject: z.string().optional(), payload: z.any().optional() }),
    handler: async (i, ctx) => { await sendAgentMessage(ctx.businessId, ctx.agentRole, i.toRole, i.body, i.payload, i.subject); return { sent: true }; },
  },
  emit_event: {
    name: "emit_event", description: "Emit a domain event other agents can react to.",
    schema: z.object({ type: z.string(), payload: z.any() }),
    handler: async (i, ctx) => { await publishEvent({ businessId: ctx.businessId, type: i.type, payload: i.payload }); return { emitted: true }; },
  },
  request_approval: {
    name: "request_approval", description: "Request human approval before a sensitive action (contracts, refunds, spend, deploys).",
    schema: z.object({ action: z.string(), summary: z.string(), payload: z.any() }),
    sensitive: true,
    handler: async (i, ctx) => requireApproval(ctx, i.action, i.summary, i.payload),
  },
  notify_owner: {
    name: "notify_owner", description: "Notify the business owner (dashboard + Slack).",
    schema: z.object({ title: z.string(), body: z.string() }),
    handler: async (i, ctx) => {
      const prefs: any = (await prisma.business.findUnique({ where: { id: ctx.businessId }, select: { notificationPrefs: true } }))?.notificationPrefs;
      if (prefs?.slackChannel) await notifySlack(prefs.slackChannel, `*${i.title}*\n${i.body}`).catch(() => {});
      return { notified: true };
    },
  },
};

export function toolSpecs(names: string[]) {
  return names.filter((n) => TOOLS[n]).map((n) => ({
    name: TOOLS[n].name,
    description: TOOLS[n].description,
    input_schema: zodToJsonSchema(TOOLS[n].schema, { target: "openApi3" }) as any,
  }));
}
