import { Job, Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@leadhunter/db";
import { ai } from "../ai";
import { sendEmail } from "@leadhunter/integrations";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null });
const followup = new Queue("followup", { connection });

/**
 * Follow-up engine: if no inbound reply since last outbound, send a
 * gentle follow-up; stop after campaign.maxFollowUps attempts or on any reply.
 */
export async function followupProcessor(job: Job) {
  if (job.name === "scan") return; // reserved for reconciliation sweeps

  const { leadId, attempt } = job.data as { leadId: string; attempt: number };
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { business: true, campaign: true, contacts: { where: { isPrimary: true } }, messages: { orderBy: { createdAt: "desc" }, take: 5 } },
  });
  if (!lead || lead.optedOut) return;
  if (["REPLIED", "INTERESTED", "MEETING_SCHEDULED", "WON", "LOST", "ARCHIVED"].includes(lead.stage)) return;
  const max = lead.campaign?.maxFollowUps ?? 3;
  if (attempt > max) { await prisma.activity.create({ data: { leadId, type: "note", detail: { note: "Follow-up sequence completed, no reply." } } }); return; }

  const contact = lead.contacts[0];
  if (contact?.email) {
    const gen = await ai.generateEmail({
      business: { name: lead.business.name, services: lead.business.services, tone: lead.business.tone, calendarLink: lead.business.calendarLink },
      lead: { companyName: lead.companyName, contactName: contact.name, industry: lead.industry, painPoints: lead.painPoints },
      followUp: { attempt, previousSubject: lead.messages.find((m) => m.subject)?.subject },
      language: lead.business.languages[0] ?? "en",
    });
    const msg = await prisma.message.create({ data: { leadId, channel: "EMAIL", direction: "OUTBOUND", subject: gen.subject, body: gen.body_html, status: "QUEUED", meta: { followUp: attempt } } });
    try {
      const out = await sendEmail({ to: contact.email, subject: gen.subject, html: gen.body_html, from: process.env.DEFAULT_FROM_EMAIL ?? "outreach@leadhunter.app", unsubscribeUrl: `${process.env.APP_URL}/u/${leadId}` });
      await prisma.message.update({ where: { id: msg.id }, data: { status: "SENT", sentAt: new Date(), providerId: out.providerId } });
    } catch (e: any) {
      await prisma.message.update({ where: { id: msg.id }, data: { status: "FAILED", meta: { error: String(e.message) } } });
    }
  }

  const days = lead.campaign?.followUpDays ?? [3, 7, 14];
  const nextDelay = (days[attempt] ?? days[days.length - 1]) * 86400_000;
  await followup.add("check", { leadId, attempt: attempt + 1 }, { delay: nextDelay, removeOnComplete: true });
}
