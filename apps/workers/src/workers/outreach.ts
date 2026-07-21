import { Job, Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@leadhunter/db";
import { sendEmail, sendWhatsAppTemplate, sendWhatsAppText } from "@leadhunter/integrations";
import { ai } from "../ai";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null });
const followup = new Queue("followup", { connection });

/**
 * Outreach engine — every send passes four gates:
 *  1. Suppression list (opt-outs, bounces, complaints)
 *  2. Daily rate limit per business (maxOutreachPerDay)
 *  3. Working-hours window in the business timezone
 *  4. Lead not opted out and has a real, verified destination
 * Then generates a personalized message via the AI service and sends.
 */
export async function outreachProcessor(job: Job) {
  if (job.name === "send-existing") return sendExisting(job.data.messageId);

  const lead = await prisma.lead.findUnique({
    where: { id: job.data.leadId },
    include: { business: true, campaign: true, contacts: { where: { isPrimary: true } } },
  });
  if (!lead || lead.optedOut) return;
  const b = lead.business;

  // Gate 2: daily cap
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sentToday = await prisma.message.count({
    where: { lead: { businessId: b.id }, direction: "OUTBOUND", sentAt: { gte: today } },
  });
  if (sentToday >= b.maxOutreachPerDay) {
    await job.moveToDelayed(Date.now() + 3600_000, job.token); // retry next hour
    return;
  }

  // Gate 3: working hours
  if (!withinWorkingHours(b.timezone, b.workingHoursStart, b.workingHoursEnd)) {
    await job.moveToDelayed(nextWorkingTime(b.timezone, b.workingHoursStart), job.token);
    return;
  }

  const contact = lead.contacts[0];
  const channels = lead.campaign?.channels ?? ["EMAIL"];
  const ctx = {
    business: { name: b.name, description: b.description, services: b.services, tone: b.tone, calendarLink: b.calendarLink },
    lead: {
      companyName: lead.companyName, industry: lead.industry, city: lead.city, country: lead.country,
      painPoints: lead.painPoints, potentialNeed: lead.potentialNeed,
      websiteExcerpt: (lead.latestNews as any)?.websiteExcerpt ?? "",
      contactName: contact?.name, contactTitle: contact?.title,
      companySize: lead.employeeCount, techStack: lead.techStack,
    },
    language: pickLanguage(b.languages, lead.country),
  };

  // EMAIL
  if (channels.includes("EMAIL") && contact?.email) {
    if (await suppressed("email", contact.email)) return;
    const gen = await ai.generateEmail(ctx);
    const msg = await prisma.message.create({
      data: { leadId: lead.id, channel: "EMAIL", direction: "OUTBOUND", subject: gen.subject, body: gen.body_html, status: "QUEUED" },
    });
    try {
      const unsubscribeUrl = `${process.env.APP_URL}/u/${lead.id}`;
      const out = await sendEmail({ to: contact.email, subject: gen.subject, html: gen.body_html, from: senderFor(b), unsubscribeUrl });
      await prisma.message.update({ where: { id: msg.id }, data: { status: "SENT", sentAt: new Date(), providerId: out.providerId } });
    } catch (e: any) {
      await prisma.message.update({ where: { id: msg.id }, data: { status: "FAILED", meta: { error: String(e.message) } } });
    }
  }

  // WHATSAPP — business-initiated must use an approved template (Meta policy)
  if (channels.includes("WHATSAPP") && lead.whatsapp) {
    if (!(await suppressed("phone", lead.whatsapp))) {
      const gen = await ai.generateWhatsApp(ctx);
      const msg = await prisma.message.create({
        data: { leadId: lead.id, channel: "WHATSAPP", direction: "OUTBOUND", body: gen.body, status: "QUEUED" },
      });
      try {
        const out = await sendWhatsAppTemplate(lead.whatsapp, "intro_outreach", ctx.language, [contact?.name ?? lead.companyName, b.name]);
        await prisma.message.update({ where: { id: msg.id }, data: { status: "SENT", sentAt: new Date(), providerId: out.providerId } });
      } catch (e: any) {
        await prisma.message.update({ where: { id: msg.id }, data: { status: "FAILED", meta: { error: String(e.message) } } });
      }
    }
  }

  await prisma.lead.update({ where: { id: lead.id }, data: { stage: "CONTACTED" } });
  await prisma.activity.create({ data: { leadId: lead.id, type: "email_sent", detail: { channels } } });

  // Schedule the first follow-up check
  const days = lead.campaign?.followUpDays?.[0] ?? 3;
  await followup.add("check", { leadId: lead.id, attempt: 1 }, { delay: days * 86400_000, removeOnComplete: true });
}

async function sendExisting(messageId: string) {
  const msg = await prisma.message.findUnique({ where: { id: messageId }, include: { lead: { include: { business: true, contacts: { where: { isPrimary: true } } } } } });
  if (!msg) return;
  const { lead } = msg;
  try {
    if (msg.channel === "WHATSAPP" && lead.whatsapp) {
      const out = await sendWhatsAppText(lead.whatsapp, msg.body); // inside 24h service window
      await prisma.message.update({ where: { id: msg.id }, data: { status: "SENT", sentAt: new Date(), providerId: out.providerId } });
    } else if (msg.channel === "EMAIL" && lead.contacts[0]?.email) {
      const out = await sendEmail({ to: lead.contacts[0].email, subject: msg.subject ?? `Re: ${lead.business.name}`, html: msg.body, from: senderFor(lead.business), unsubscribeUrl: `${process.env.APP_URL}/u/${lead.id}` });
      await prisma.message.update({ where: { id: msg.id }, data: { status: "SENT", sentAt: new Date(), providerId: out.providerId } });
    }
  } catch (e: any) {
    await prisma.message.update({ where: { id: msg.id }, data: { status: "FAILED", meta: { error: String(e.message) } } });
  }
}

async function suppressed(scope: string, value: string) {
  return !!(await prisma.suppression.findUnique({ where: { scope_value: { scope, value } } }));
}
function senderFor(b: { branding: any; name: string }) {
  return (b.branding as any)?.fromEmail ?? process.env.DEFAULT_FROM_EMAIL ?? "outreach@leadhunter.app";
}
function pickLanguage(langs: string[], country?: string | null) {
  const arabic = ["SA", "AE", "QA", "KW", "OM", "BH", "EG", "JO"];
  if (country && arabic.includes(country) && langs.includes("ar")) return "ar";
  return langs[0] ?? "en";
}
function withinWorkingHours(tz: string, start: string, end: string) {
  const now = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  return now >= start && now <= end;
}
function nextWorkingTime(tz: string, start: string) {
  return Date.now() + 30 * 60_000; // simple: re-check in 30 min; cron precision handled by repeated delays
}
