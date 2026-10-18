import { prisma } from "@leadhunter/db";
import { sendEmail } from "@leadhunter/integrations";
import { readConfig } from "./booking";

const db: any = prisma;
const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
export type Briefing = { business: { id: string; name: string }; headlines: string[]; stats: Record<string, number>; today: { when: string; title: string; who: string }[]; next: { when: string; title: string; who: string }[]; approvals: { id: string; summary: string }[]; attention: string[]; text: string };

const tf = (d: Date, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
const dayKey = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
const safe = async <T,>(p: Promise<T>, d: T): Promise<T> => { try { return await p; } catch { return d; } };

/** A plain-language summary of one company: what happened, what is coming, what needs a decision. No AI call, so it is instant and free. */
export async function buildBriefing(businessId: string): Promise<Briefing> {
  const biz = await db.business.findUnique({ where: { id: businessId } });
  const tz = readConfig(biz).timezone, now = new Date(), since = new Date(Date.now() - 24 * 3600_000), soon = new Date(Date.now() + 7 * 86400_000);
  const [newLeads, qualified, replies, handoffs, approvals, overdue, atRisk, failedRuns, overdueTasks, bookings] = await Promise.all([
    safe(db.lead.count({ where: { businessId, createdAt: { gte: since } } }), 0),
    safe(db.lead.count({ where: { businessId, stage: "QUALIFIED", updatedAt: { gte: since } } }), 0),
    safe(db.message.count({ where: { direction: "INBOUND", createdAt: { gte: since }, conversation: { lead: { businessId } } } }), 0),
    safe(db.conversation.count({ where: { state: "HUMAN_HANDOFF", lead: { businessId } } }), 0),
    safe(db.approval.findMany({ where: { businessId, status: "pending" }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, summary: true } }), [] as any[]),
    safe(db.invoice.aggregate({ where: { businessId, status: "overdue" }, _sum: { amount: true }, _count: true }), { _sum: { amount: 0 }, _count: 0 }),
    safe(db.project.count({ where: { businessId, health: "red" } }), 0),
    safe(db.agentRun.count({ where: { status: "failed", startedAt: { gte: since }, agent: { businessId } } }), 0),
    safe(db.task.count({ where: { businessId, status: { not: "done" }, dueDate: { lt: now } } }), 0),
    safe(db.booking.findMany({ where: { businessId, status: "confirmed", startsAt: { gte: now, lte: soon } }, orderBy: { startsAt: "asc" }, take: 20 }), [] as any[]),
  ]);
  const today = bookings.filter((b: any) => dayKey(b.startsAt, tz) === dayKey(now, tz)).map((b: any) => ({ when: tf(b.startsAt, tz), title: b.typeTitle, who: b.name }));
  const next = bookings.filter((b: any) => dayKey(b.startsAt, tz) !== dayKey(now, tz)).slice(0, 5).map((b: any) => ({ when: tf(b.startsAt, tz), title: b.typeTitle, who: b.name }));
  const attention = [
    approvals.length && `${approvals.length} item(s) are waiting for your approval`,
    handoffs && `${handoffs} conversation(s) were handed to you by the AI`,
    overdue._count && `${overdue._sum.amount ?? 0} overdue across ${overdue._count} invoice(s)`,
    overdueTasks && `${overdueTasks} task(s) are past their due date`,
    atRisk && `${atRisk} project(s) are at risk`,
    failedRuns && `${failedRuns} AI run(s) failed in the last day (check your AI keys)`,
  ].filter(Boolean) as string[];
  const headlines = [
    today.length ? `${today.length} meeting(s) today` : "No meetings today",
    newLeads && `${newLeads} new lead(s)`, qualified && `${qualified} newly qualified`, replies && `${replies} reply(ies) received`,
  ].filter(Boolean) as string[];
  const stats = { newLeads, qualified, replies, handoffs, approvals: approvals.length, overdueTasks, failedRuns, meetingsToday: today.length, meetingsWeek: bookings.length };
  const text = [`${biz.name}: ${headlines.join(", ")}.`, ...(attention.length ? ["Needs you: " + attention.join("; ") + "."] : ["Nothing needs your attention right now."]),
    ...(today.length ? ["Today: " + today.map((t: any) => `${t.when} ${t.title} with ${t.who}`).join("; ") + "."] : []),
    ...(next.length ? ["Coming up: " + next.map((t: any) => `${t.when} ${t.title} with ${t.who}`).join("; ") + "."] : [])].join("\n");
  return { business: { id: biz.id, name: biz.name }, headlines, stats, today, next, approvals, attention, text };
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
export function briefingHtml(name: string, bs: Briefing[]) {
  const li = (a: string[]) => a.map((x) => `<li>${esc(x)}</li>`).join("");
  return `<div style="font-family:system-ui,sans-serif;max-width:560px"><h2 style="margin:0 0 4px">Good morning${name ? ", " + esc(name) : ""}</h2><p style="color:#666;margin:0 0 16px">Your daily briefing from your Chief of Staff.</p>` +
    bs.map((b) => `<h3 style="margin:18px 0 6px">${esc(b.business.name)}</h3><p style="margin:0 0 6px">${esc(b.headlines.join(" · "))}</p>` +
      (b.attention.length ? `<p style="margin:8px 0 2px"><b>Needs you</b></p><ul>${li(b.attention)}</ul>` : `<p style="color:#666">Nothing needs your attention.</p>`) +
      (b.today.length ? `<p style="margin:8px 0 2px"><b>Today</b></p><ul>${li(b.today.map((t) => `${t.when} · ${t.title} with ${t.who}`))}</ul>` : "") +
      (b.next.length ? `<p style="margin:8px 0 2px"><b>Coming up</b></p><ul>${li(b.next.map((t) => `${t.when} · ${t.title} with ${t.who}`))}</ul>` : "")).join("") +
    `<p style="margin-top:20px"><a href="${appUrl()}/dashboard">Open aiOS</a> to ask your Chief of Staff anything.</p></div>`;
}

export type CosPrefs = { email: boolean; hour: number; tz: string; lastSent?: string };
const localParts = (tz: string) => { const now = new Date(); return { date: dayKey(now, tz), hour: +new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now) }; };

export async function emailBriefing(userId: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, include: { memberships: true } });
  const tenantId = user?.memberships?.[0]?.tenantId;
  if (!user || !tenantId) throw new Error("No workspace found");
  const businesses = await db.business.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" }, take: 5 });
  const bs = await Promise.all(businesses.map((b: any) => buildBriefing(b.id)));
  await sendEmail({ to: user.email, subject: `Your daily briefing · ${bs.map((b) => b.headlines[0]).filter(Boolean)[0] ?? "aiOS"}`, html: briefingHtml(user.name?.split(" ")[0] ?? "", bs), from: process.env.DEFAULT_FROM_EMAIL ?? "noreply@aios.app", unsubscribeUrl: `${appUrl()}/settings` });
}

/** Called from the scheduler tick: sends each opted-in user their briefing once per local day, after their chosen hour. */
export async function runDailyBriefings(): Promise<number> {
  let sent = 0;
  const rows = await safe(db.userPref.findMany({ where: { key: "chief_of_staff" } }), [] as any[]);
  for (const r of rows) {
    const v = r.value as CosPrefs | null;
    if (!v?.email) continue;
    const tz = v.tz || "Asia/Riyadh", lp = (() => { try { return localParts(tz); } catch { return localParts("Asia/Riyadh"); } })();
    if (lp.hour < (v.hour ?? 7) || v.lastSent === lp.date) continue;
    try {
      await db.userPref.update({ where: { id: r.id }, data: { value: { ...v, lastSent: lp.date } } }); // mark first so a slow send is never repeated
      await emailBriefing(r.userId); sent++;
    } catch (e: any) { console.error("[briefing]", r.userId, e?.message ?? e); }
  }
  return sent;
}
