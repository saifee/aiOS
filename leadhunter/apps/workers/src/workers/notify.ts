import { Job } from "bullmq";
import { prisma } from "@leadhunter/db";
import { notifySlack, notifyTelegram, sendEmail } from "@leadhunter/integrations";

/**
 * Owner notifications — fired ONLY for: interested lead, meeting booked,
 * quote requested, high-value opportunity. Channels per business prefs.
 */
export async function notifyProcessor(job: Job) {
  const { leadId, kind, note } = job.data as { leadId: string; kind: string; note?: string };
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { business: { include: { tenant: { include: { users: { include: { user: true } } } } } } },
  });
  if (!lead) return;
  const prefs = (lead.business.notificationPrefs as any) ?? { channels: ["email"], events: ["interested_lead", "meeting_booked", "quote_requested", "high_value"] };
  if (!prefs.events?.includes(kind)) return;

  const title = {
    interested_lead: `🎯 Interested lead: ${lead.companyName}`,
    meeting_booked: `📅 Meeting booked: ${lead.companyName}`,
    quote_requested: `💰 Quote requested: ${lead.companyName}`,
    high_value: `⭐ High-value opportunity: ${lead.companyName}`,
  }[kind] ?? `Update: ${lead.companyName}`;
  const body = `${note ?? ""}\nScore: ${lead.leadScore} | Stage: ${lead.stage} | ${lead.city ?? ""} ${lead.country ?? ""}\nOpen: ${process.env.APP_URL}/leads/${lead.id}`;

  for (const m of lead.business.tenant.users.filter((u) => ["OWNER", "ADMIN"].includes(u.role))) {
    await prisma.notification.create({ data: { userId: m.userId, title, body, kind, channels: prefs.channels, meta: { leadId } } });
    if (prefs.channels.includes("email") && m.user.email)
      await sendEmail({ to: m.user.email, subject: title, html: body.replace(/\n/g, "<br/>"), from: process.env.DEFAULT_FROM_EMAIL ?? "alerts@leadhunter.app", unsubscribeUrl: `${process.env.APP_URL}/settings/notifications` }).catch(() => {});
    if (prefs.channels.includes("slack") && prefs.slackChannel) await notifySlack(prefs.slackChannel, `*${title}*\n${body}`).catch(() => {});
    if (prefs.channels.includes("telegram") && prefs.telegramChatId) await notifyTelegram(prefs.telegramChatId, `*${title}*\n${body}`).catch(() => {});
  }
}
