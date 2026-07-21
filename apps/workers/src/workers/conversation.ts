import { Job, Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@leadhunter/db";
import { ai } from "../ai";
import { sendEmail, sendWhatsAppText } from "@leadhunter/integrations";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null });
const notify = new Queue("notify", { connection });

/**
 * AI conversation agent: on every inbound reply, classify intent, draft a
 * grounded response (services, pricing policy, booking link), send it, and
 * escalate to the owner when the lead is interested / asks for a quote /
 * needs a human. The AI never invents pricing — it only shares what the
 * business configured, and hands off when unsure.
 */
export async function conversationProcessor(job: Job) {
  const { leadId, channel, text } = job.data as { leadId: string; channel: "EMAIL" | "WHATSAPP"; text: string };
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { business: true, contacts: { where: { isPrimary: true } }, messages: { orderBy: { createdAt: "asc" }, take: 30 } },
  });
  if (!lead || lead.optedOut) return;
  const b = lead.business;

  let conv = await prisma.conversation.findFirst({ where: { leadId, channel } });
  if (!conv) conv = await prisma.conversation.create({ data: { leadId, channel } });
  if (conv.state === "HUMAN_HANDOFF") {
    await notify.add("notify", { leadId, kind: "interested_lead", note: "New reply on a human-handled conversation." });
    return;
  }

  const result = await ai.handleReply({
    business: {
      name: b.name, description: b.description, services: b.services, tone: b.tone,
      calendarLink: b.calendarLink, languages: b.languages,
      pricingPolicy: (b.branding as any)?.pricingPolicy ?? "Do not quote prices; offer a call instead.",
    },
    lead: { companyName: lead.companyName, contactName: lead.contacts[0]?.name, industry: lead.industry },
    history: lead.messages.map((m) => ({ role: m.direction === "OUTBOUND" ? "assistant" : "user", text: m.body.slice(0, 1500) })),
    inbound: text,
  });

  await prisma.conversation.update({ where: { id: conv.id }, data: { intent: result.intent, summary: result.reply.slice(0, 300) } });

  // Stage transitions from intent
  const stageMap: Record<string, string> = { interested: "INTERESTED", pricing: "INTERESTED", meeting: "INTERESTED", not_interested: "LOST" };
  const newStage = result.stage_hint ?? stageMap[result.intent];
  if (newStage) await prisma.lead.update({ where: { id: leadId }, data: { stage: newStage as any } });

  // Escalate to owner only on genuine opportunity or explicit need
  if (result.escalate || ["interested", "pricing", "meeting"].includes(result.intent)) {
    await prisma.conversation.update({ where: { id: conv.id }, data: { state: result.escalate ? "HUMAN_HANDOFF" : "AI_HANDLING", handoffReason: result.escalate_reason } });
    await notify.add("notify", {
      leadId,
      kind: result.intent === "meeting" ? "meeting_booked" : result.intent === "pricing" ? "quote_requested" : "interested_lead",
      note: result.escalate_reason,
    }, { removeOnComplete: true });
  }
  if (result.escalate) return; // human takes over — AI stays silent

  // Send AI reply on the same channel
  const msg = await prisma.message.create({ data: { leadId, channel, direction: "OUTBOUND", body: result.reply, status: "QUEUED", meta: { ai: true, intent: result.intent } } });
  try {
    if (channel === "WHATSAPP" && lead.whatsapp) {
      const out = await sendWhatsAppText(lead.whatsapp, result.reply); // within 24h service window after their reply
      await prisma.message.update({ where: { id: msg.id }, data: { status: "SENT", sentAt: new Date(), providerId: out.providerId } });
    } else if (channel === "EMAIL" && lead.contacts[0]?.email) {
      const out = await sendEmail({ to: lead.contacts[0].email, subject: `Re: ${b.name}`, html: result.reply.replace(/\n/g, "<br/>"), from: process.env.DEFAULT_FROM_EMAIL ?? "outreach@leadhunter.app", unsubscribeUrl: `${process.env.APP_URL}/u/${leadId}` });
      await prisma.message.update({ where: { id: msg.id }, data: { status: "SENT", sentAt: new Date(), providerId: out.providerId } });
    }
  } catch (e: any) {
    await prisma.message.update({ where: { id: msg.id }, data: { status: "FAILED", meta: { error: String(e.message) } } });
  }
}
