import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { prisma } from "@leadhunter/db";
import { sendEmail, sendWhatsAppText, notifySlack, discoverViaSearch, discoverViaPlaces, generateImage, createAvatarVideo } from "@leadhunter/integrations";
import { searchKnowledge } from "./memory";
import { sendAgentMessage, publishEvent, dispatchSwarm } from "./bus";

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
  record_expense: {
    name: "record_expense",
    description: "Record a business expense so profit, cash flow, and runway stay accurate.",
    schema: z.object({ category: z.enum(["salaries","infrastructure","software","marketing","contractors","office","other"]), amount: z.number(), vendor: z.string().optional(), currency: z.string().default("SAR"), recurring: z.boolean().default(false), note: z.string().optional(), incurredAt: z.string().optional() }),
    handler: async (i, ctx) => prisma.expense.create({ data: { businessId: ctx.businessId, category: i.category, amount: i.amount, vendor: i.vendor, currency: i.currency, recurring: i.recurring, note: i.note, incurredAt: i.incurredAt ? new Date(i.incurredAt) : undefined } }),
  },
  generate_image: {
    name: "generate_image",
    description: "Generate a marketing image from a text brief (logos, social posts, ads, infographics). Returns a stored asset.",
    schema: z.object({ prompt: z.string(), size: z.enum(["1024x1024","1536x1024","1024x1536"]).default("1024x1024") }),
    handler: async (i, ctx) => {
      const { b64 } = await generateImage(i.prompt, i.size);
      const asset = await prisma.mediaAsset.create({ data: { businessId: ctx.businessId, kind: "image", prompt: i.prompt, provider: "openai", status: "ready", url: `data:image/png;base64,${b64}` } });
      return { assetId: asset.id, kind: "image" };
    },
  },
  generate_video: {
    name: "generate_video",
    description: "Generate an avatar/explainer video from a script. Submits a render job; poll the asset for the final URL.",
    schema: z.object({ script: z.string() }),
    handler: async (i, ctx) => {
      const { videoId } = await createAvatarVideo(i.script);
      const asset = await prisma.mediaAsset.create({ data: { businessId: ctx.businessId, kind: "video", prompt: i.script.slice(0, 500), provider: "heygen", status: "pending", providerRef: videoId } });
      return { assetId: asset.id, status: "pending", note: "Video rendering; check the asset shortly." };
    },
  },
  draft_post: {
    name: "draft_post",
    description: "Draft or schedule a social post for a channel. Publishing happens after review/schedule.",
    schema: z.object({ channel: z.enum(["linkedin","facebook","instagram","x","tiktok","youtube"]), content: z.string(), mediaUrl: z.string().optional(), scheduledAt: z.string().optional() }),
    handler: async (i, ctx) => prisma.socialPost.create({ data: { businessId: ctx.businessId, channel: i.channel, content: i.content, mediaUrl: i.mediaUrl, status: i.scheduledAt ? "scheduled" : "draft", scheduledAt: i.scheduledAt ? new Date(i.scheduledAt) : undefined } }),
  },
  delegate_build: {
    name: "delegate_build",
    description: "Delegate a coding task to the developer swarm (Claude architects+codes, Gemini reviews, OpenAI fixes, tests run, PR opened for approval). Use for real feature/bugfix work.",
    schema: z.object({ task: z.string(), repo: z.string().optional() }),
    handler: async (i, ctx) => { await dispatchSwarm(ctx.businessId, i.task, i.repo); return { queued: true, note: "Swarm dispatched; results appear in Studio → Dev Swarm." }; },
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
  find_prospects: {
    name: "find_prospects",
    description: "Search the public web for prospect companies matching a query (optionally by city/country). Returns company names + websites you can then create_lead from. Use this to hunt for schools/companies/tenders that need our services.",
    schema: z.object({ query: z.string(), city: z.string().optional(), country: z.string().optional(), usePlaces: z.boolean().default(false) }),
    handler: async (i) => {
      const results = i.usePlaces && i.city
        ? await discoverViaPlaces(i.query, i.city, i.country).catch(() => [])
        : await discoverViaSearch(i.query, { city: i.city, country: i.country, source: "growth" }).catch(() => []);
      return results.slice(0, 15).map((r: any) => ({ companyName: r.companyName, website: r.website, city: r.city, country: r.country, sourceUrl: r.sourceUrl }));
    },
  },
};

export function toolSpecs(names: string[]) {
  return names.filter((n) => TOOLS[n]).map((n) => ({
    name: TOOLS[n].name,
    description: TOOLS[n].description,
    input_schema: zodToJsonSchema(TOOLS[n].schema as any, { target: "openApi3" }) as any,
  }));
}
