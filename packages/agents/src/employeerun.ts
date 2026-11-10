import { prisma } from "@leadhunter/db";
import { assertPublicUrl } from "@leadhunter/integrations";
import { EMPLOYEES, ROUTINES, Routine, Employee, Source } from "./employees";
import { complete, withBusinessContext, NoAiKeyError, explainAiError } from "./llm";
import { bookingLinkFor } from "./booking";

const db: any = prisma;
const safe = async <T,>(p: Promise<T> | T, d: T): Promise<T> => { try { return await p; } catch { return d; } };
const cut = (v: unknown, n: number) => { const s = typeof v === "string" ? v : JSON.stringify(v ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const list = (v: any) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").join(", ") : typeof v === "string" ? v : "");

// ── Time: schedules are evaluated in the business's own time zone ─────────────
const WD = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export function localParts(d: Date, tz: string) {
  let f: Intl.DateTimeFormat;
  try { f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }); }
  catch { f = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }); }
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, wd: WD.indexOf(String(p.weekday).toLowerCase().slice(0, 3)) };
}
const isoWeek = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d)); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = Date.UTC(t.getUTCFullYear(), 0, 1); return { year: t.getUTCFullYear(), week: Math.ceil(((+t - start) / 86400000 + 1) / 7) };
};
const pad = (n: number) => String(n).padStart(2, "0");
export function periodKey(period: "day" | "week" | "month", p: ReturnType<typeof localParts>) {
  if (period === "day") return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  if (period === "month") return `${p.y}-${pad(p.m)}`;
  const w = isoWeek(p.y, p.m, p.d); return `${w.year}-W${pad(w.week)}`;
}
const isWeekday = (y: number, m: number, d: number) => { const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return w >= 1 && w <= 5; };
export function dayMatches(days: string, p: ReturnType<typeof localParts>) {
  if (days === "first-weekday") { if (!isWeekday(p.y, p.m, p.d)) return false; for (let d = 1; d < p.d; d++) if (isWeekday(p.y, p.m, d)) return false; return true; }
  if (days === "last-weekday") { if (!isWeekday(p.y, p.m, p.d)) return false; const dim = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate(); for (let d = p.d + 1; d <= dim; d++) if (isWeekday(p.y, p.m, d)) return false; return true; }
  const m = days.match(/^([a-z]{3})(?:-([a-z]{3}))?$/); if (!m) return false;
  const a = WD.indexOf(m[1]), b = m[2] ? WD.indexOf(m[2]) : a;
  return a <= b ? p.wd >= a && p.wd <= b : p.wd >= a || p.wd <= b;
}
/** A routine may start from its fire hour until 5 hours later, so a late scheduler tick still runs it (the period key stops double runs). */
export const isDue = (r: Routine, p: ReturnType<typeof localParts>) => dayMatches(r.cadence.days, p) && p.h >= r.cadence.hour && p.h < Math.min(24, r.cadence.hour + 6);

// ── Website health (deterministic, free) ──────────────────────────────────────
export type SiteCheck = { url: string; ok: boolean; status?: number; ms?: number; title?: string; description?: boolean; h1?: number; canonical?: boolean; viewport?: boolean; lang?: boolean; https?: boolean; hsts?: boolean; csp?: boolean; robots?: number; sitemap?: number; error?: string };
async function fetchChecked(raw: string, method = "GET"): Promise<Response> {
  let url = raw;
  for (let i = 0; i < 4; i++) {
    await assertPublicUrl(url);
    const r = await fetch(url, { method, redirect: "manual", signal: AbortSignal.timeout(12_000), headers: { "user-agent": "aiOS-site-check/1.0" } });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { url = new URL(r.headers.get("location")!, url).toString(); continue; }
    return Object.assign(r, { finalUrl: url });
  }
  throw new Error("Too many redirects");
}
export async function siteCheck(website: string): Promise<SiteCheck> {
  const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const out: SiteCheck = { url, ok: false };
  try {
    const t0 = Date.now(); const r: any = await fetchChecked(url);
    out.ms = Date.now() - t0; out.status = r.status; out.ok = r.status >= 200 && r.status < 400; out.https = String(r.finalUrl).startsWith("https:");
    out.hsts = !!r.headers.get("strict-transport-security"); out.csp = !!r.headers.get("content-security-policy");
    const html = (await r.text()).slice(0, 250_000);
    out.title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim().slice(0, 120);
    out.description = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html);
    out.h1 = (html.match(/<h1[\s>]/gi) ?? []).length; out.canonical = /<link[^>]+rel=["']canonical["']/i.test(html);
    out.viewport = /<meta[^>]+name=["']viewport["']/i.test(html); out.lang = /<html[^>]+lang=/i.test(html);
    const origin = new URL(r.finalUrl).origin;
    out.robots = await fetchChecked(`${origin}/robots.txt`).then((x) => x.status).catch(() => 0);
    out.sitemap = await fetchChecked(`${origin}/sitemap.xml`).then((x) => x.status).catch(() => 0);
  } catch (e: any) { out.error = String(e?.message ?? e).slice(0, 160); }
  return out;
}
function siteText(c: SiteCheck, prev?: SiteCheck) {
  if (c.error && !c.status) return `## Site check: ${c.url}\n**Could not reach the site**: ${c.error}`;
  const yn = (v?: boolean) => (v ? "yes" : "**missing**");
  const rows = [`Status ${c.status} (${c.ok ? "up" : "**problem**"}), loaded in ${c.ms} ms`, `HTTPS: ${yn(c.https)} · HSTS: ${yn(c.hsts)} · CSP: ${yn(c.csp)}`,
    `Title: ${c.title || "**missing**"}`, `Meta description: ${yn(c.description)} · H1 tags: ${c.h1} ${c.h1 === 1 ? "" : "(should be exactly 1)"} · Canonical: ${yn(c.canonical)}`,
    `Mobile viewport: ${yn(c.viewport)} · Language set: ${yn(c.lang)}`, `robots.txt: ${c.robots === 200 ? "found" : "**not found**"} · sitemap.xml: ${c.sitemap === 200 ? "found" : "**not found**"}`];
  const changes: string[] = [];
  if (prev) {
    if (prev.ok && !c.ok) changes.push("The site was up last time and is **down now**.");
    if (prev.ms && c.ms && c.ms > prev.ms * 1.8 && c.ms > 1500) changes.push(`Slower than last check (${prev.ms} → ${c.ms} ms).`);
    if (prev.title && c.title && prev.title !== c.title) changes.push("The page title changed.");
    for (const k of ["https", "hsts", "csp", "description", "canonical", "viewport"] as const) if (prev[k] && !c[k]) changes.push(`${k} was present and is now missing.`);
  }
  return `## Site check: ${c.url}\n${rows.map((r) => `- ${r}`).join("\n")}${changes.length ? `\n\n**Changes since last check**\n${changes.map((r) => `- ${r}`).join("\n")}` : prev ? "\n\nNo changes since the last check." : ""}`;
}

// ── Data the routines read ────────────────────────────────────────────────────
type Ctx = { businessId: string; business: any; now: Date; employee: Employee; website?: string; prev?: any };
const days = (n: number, from = new Date()) => new Date(from.getTime() - n * 86400_000);

const GATHER: Record<Source, (c: Ctx) => Promise<string>> = {
  profile: async ({ business: b }) => {
    const link = bookingLinkFor(b);
    return [`Business: ${b.name}`, b.description && `About: ${cut(b.description, 500)}`, list(b.services) && `Services: ${cut(list(b.services), 300)}`, list(b.industriesServed) && `Industries: ${list(b.industriesServed)}`,
      list(b.targetCountries) && `Markets: ${list(b.targetCountries)}`, list(b.keywords) && `Keywords: ${cut(list(b.keywords), 200)}`, `Tone: ${b.tone}`, list(b.languages) && `Languages: ${list(b.languages)}`, link && `Booking link: ${link}`].filter(Boolean).join("\n");
  },
  pipeline: async ({ businessId }) => {
    const rows: any[] = await safe(db.lead.groupBy({ by: ["stage"], where: { businessId }, _count: true }), []);
    return rows.length ? rows.map((r) => `${r.stage}: ${r._count}`).join(" · ") : "No leads yet.";
  },
  newLeads: async ({ businessId, now }) => {
    const rows: any[] = await safe(db.lead.findMany({ where: { businessId, createdAt: { gte: days(7, now) } }, orderBy: { leadScore: "desc" }, take: 12 }), []);
    return rows.length ? rows.map((l) => `- ${l.companyName} (${[l.industry, l.city, l.country].filter(Boolean).join(", ")}) score ${l.leadScore}, stage ${l.stage}. Need: ${cut(l.potentialNeed ?? "n/a", 120)}. Pains: ${cut(list(l.painPoints) || "n/a", 120)}. Signals: ${cut(list(l.growthSignals) || "n/a", 120)}`).join("\n") : "No new leads in the last 7 days.";
  },
  untouched: async ({ businessId }) => {
    const rows: any[] = await safe(db.lead.findMany({ where: { businessId, optedOut: false, stage: { in: ["FOUND", "QUALIFIED"] }, messages: { none: { direction: "OUTBOUND" } } }, orderBy: { leadScore: "desc" }, take: 8 }), []);
    return rows.length ? rows.map((l) => `- ${l.companyName} (${[l.industry, l.country].filter(Boolean).join(", ")}) score ${l.leadScore}. Need: ${cut(l.potentialNeed ?? "n/a", 140)}. Pains: ${cut(list(l.painPoints) || "n/a", 120)}. Site: ${l.website ?? "n/a"}`).join("\n") : "Every qualified lead has been contacted.";
  },
  quiet: async ({ businessId, now }) => {
    const d4 = days(4, now);
    const rows: any[] = await safe(db.lead.findMany({
      where: { businessId, optedOut: false, stage: { notIn: ["WON", "LOST", "ARCHIVED"] }, messages: { some: { direction: "OUTBOUND", createdAt: { lt: d4 } }, none: { OR: [{ direction: "INBOUND" }, { createdAt: { gte: d4 } }] } } },
      orderBy: { updatedAt: "asc" }, take: 8, include: { messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, subject: true, body: true } } } }), []);
    return rows.length ? rows.map((l) => { const m = l.messages?.[0]; const age = m ? Math.floor((+now - +new Date(m.createdAt)) / 86400000) : "?"; return `- ${l.companyName} (${l.stage}) quiet ${age} days. Last message: ${cut(m?.subject || m?.body || "", 140)}`; }).join("\n") : "No leads are waiting on a reply.";
  },
  inbound: async ({ businessId, now }) => {
    const rows: any[] = await safe(db.message.findMany({ where: { direction: "INBOUND", createdAt: { gte: days(3, now) }, lead: { businessId } }, orderBy: { createdAt: "desc" }, take: 14, include: { lead: { select: { companyName: true } } } }), []);
    return rows.length ? rows.map((m) => `- [${m.channel}] ${m.lead?.companyName ?? "Unknown"} (${new Date(m.createdAt).toISOString().slice(0, 10)}): ${cut(m.subject ? `${m.subject} — ${m.body}` : m.body, 300)}`).join("\n") : "No inbound messages in the last 3 days.";
  },
  handoffs: async ({ businessId }) => {
    const rows: any[] = await safe(db.conversation.findMany({ where: { state: "HUMAN_HANDOFF", lead: { businessId } }, orderBy: { updatedAt: "desc" }, take: 5, include: { lead: { select: { companyName: true } } } }), []);
    return rows.length ? rows.map((c) => `- ${c.lead?.companyName}: ${cut(c.handoffReason || c.summary || "needs a person", 160)}`).join("\n") : "No conversations are waiting for a person.";
  },
  outbound7: async ({ businessId, now }) => {
    const since = days(7, now), where = { createdAt: { gte: since }, lead: { businessId } };
    const [sent, opened, replied, inbound] = await Promise.all([
      safe(db.message.count({ where: { ...where, direction: "OUTBOUND" } }), 0), safe(db.message.count({ where: { ...where, direction: "OUTBOUND", openedAt: { not: null } } }), 0),
      safe(db.message.count({ where: { ...where, direction: "OUTBOUND", repliedAt: { not: null } } }), 0), safe(db.message.count({ where: { ...where, direction: "INBOUND" } }), 0)]);
    return `Last 7 days: sent ${sent}, opened ${opened}, replied ${replied}, inbound received ${inbound}.`;
  },
  campaigns: async ({ businessId }) => {
    const rows: any[] = await safe(db.campaign.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 6, include: { _count: { select: { leads: true } } } }), []);
    return rows.length ? rows.map((c) => `- ${c.name}: ${c.status}, ${c._count?.leads ?? 0} leads, channels ${list(c.channels) || "n/a"}`).join("\n") : "No campaigns.";
  },
  social: async ({ businessId, now }) => {
    const rows: any[] = await safe(db.socialPost.findMany({ where: { businessId, createdAt: { gte: days(30, now) } }, orderBy: { createdAt: "desc" }, take: 30 }), []);
    if (!rows.length) return "No social posts in the last 30 days.";
    const by: Record<string, number> = {}; for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1;
    return `By status: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(", ")}. Recent: ${rows.slice(0, 4).map((r) => `[${r.channel}] ${cut(r.content, 90)}`).join(" | ")}`;
  },
  invoices: async ({ businessId }) => {
    const rows: any[] = await safe(db.invoice.findMany({ where: { businessId, status: "overdue" }, orderBy: { dueDate: "asc" }, take: 6 }), []);
    return rows.length ? rows.map((i) => `- ${i.number}: ${i.amount} ${i.currency}, due ${i.dueDate ? new Date(i.dueDate).toISOString().slice(0, 10) : "n/a"}`).join("\n") : "No overdue invoices.";
  },
  bookings: async ({ businessId, now }) => {
    const rows: any[] = await safe(db.booking.findMany({ where: { businessId, status: "confirmed", startsAt: { gte: now, lte: new Date(+now + 7 * 86400_000) } }, orderBy: { startsAt: "asc" }, take: 8 }), []);
    return rows.length ? rows.map((b) => `- ${new Date(b.startsAt).toISOString().slice(0, 16)}Z ${b.typeTitle} with ${b.name}`).join("\n") : "No bookings in the next 7 days.";
  },
  won: async ({ businessId }) => {
    const rows: any[] = await safe(db.lead.findMany({ where: { businessId, stage: { in: ["WON", "NEGOTIATION", "PROPOSAL_SENT", "MEETING_SCHEDULED", "INTERESTED"] } }, orderBy: { updatedAt: "desc" }, take: 10 }), []);
    return rows.length ? rows.map((l) => `- ${l.companyName} (${l.stage}) ${[l.industry, l.country, l.companySize].filter(Boolean).join(", ")}`).join("\n") : "No leads have advanced past the first reply yet.";
  },
  prior: async ({ businessId, employee }) => {
    const rows: any[] = await safe(db.employeeRun.findMany({ where: { businessId, employee: employee.id, status: "ok", output: { not: null } }, orderBy: { startedAt: "desc" }, take: 3 }), []);
    return rows.length ? rows.map((r) => `- ${r.routine} (${new Date(r.startedAt).toISOString().slice(0, 10)}, owner marked ${r.state}): ${cut(r.output, 380)}`).join("\n") : "No earlier work yet.";
  },
  site: async ({ website, prev }) => (website ? siteText(await siteCheck(website), prev) : "No website address set. Add it on the AI Employees page."),
  fleet: async ({ businessId }) => (await fleetReport(businessId)).text,
};

// ── Fleet health (the "what quietly stopped" check; no AI) ────────────────────
const GAP_H: Record<string, number> = { day: 80, week: 9 * 24, month: 35 * 24 };
export async function fleetReport(businessId: string) {
  const settings: any[] = await safe(db.employeeSetting.findMany({ where: { businessId, enabled: true, employee: { not: "_all" } } }), []);
  const runs: any[] = await safe(db.employeeRun.findMany({ where: { businessId, startedAt: { gte: days(40) } }, orderBy: { startedAt: "desc" }, take: 600, select: { routine: true, status: true, startedAt: true, error: true, employee: true } }), []);
  const now = Date.now();
  const rows: { employee: string; routine: string; title: string; status: "ok" | "failed" | "blocked" | "stale" | "waiting"; last?: Date; error?: string }[] = [];
  for (const s of settings) {
    const emp = EMPLOYEES.find((e) => e.id === s.employee); if (!emp) continue;
    for (const r of emp.routines) {
      const last = runs.find((x) => x.routine === r.id);
      let status: any = "waiting";
      if (last) status = last.status === "running" ? "ok" : last.status;
      const gap = GAP_H[r.cadence.period] * 3600_000;
      if ((!last || now - +new Date(last.startedAt) > gap) && now - +new Date(s.updatedAt) > gap) status = "stale";
      rows.push({ employee: emp.name, routine: r.id, title: r.title, status, last: last ? new Date(last.startedAt) : undefined, error: last?.error ?? undefined });
    }
  }
  const bad = rows.filter((r) => r.status === "failed" || r.status === "blocked" || r.status === "stale");
  const text = rows.length
    ? `FLEET: ${rows.length} routines switched on, ${rows.filter((r) => r.status === "ok").length} ran fine, ${bad.length} need attention.` + (bad.length ? "\n" + bad.map((r) => `- ${r.employee} / ${r.title}: ${r.status === "stale" ? "has not run when it should have (quietly stopped)" : r.status === "blocked" ? `blocked: ${cut(r.error ?? "no AI key", 120)}` : `failed: ${cut(r.error ?? "", 120)}`}`).join("\n") : "")
    : "No employees are switched on yet.";
  return { rows, text, bad: bad.length };
}

// ── Running one routine ───────────────────────────────────────────────────────
const SYSTEM = (e: Employee, b: any) => `You are the ${e.name} for "${b.name}". You prepare work for the owner to review. You never send, post, publish, spend money, or contact anyone: everything you write is a DRAFT.
Rules: use ONLY facts that appear under DATA. If something is not in DATA, say it is not available. Never invent customers, numbers, quotes, links, prices or results. Match the business tone (${b.tone}). Reply in the language of the business profile (English if unclear).
Format: Markdown, at most about 350 words. Start with one line headline starting with "# ". Then the deliverable. End with "## Needs you" and 1 to 4 bullets for decisions or clicks only the owner can do (write "Nothing" if none).`;

const parseJson = (t: string) => { try { return JSON.parse(t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { const m = t.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } };
const titleOf = (md: string, fallback: string) => { const l = md.split("\n").map((x) => x.trim()).find((x) => x && !x.startsWith("##")) ?? ""; return (l.replace(/^#+\s*/, "").replace(/[*_`]/g, "").slice(0, 120)) || fallback; };

async function scoreboardText(c: Ctx) {
  const [pipeline, out] = await Promise.all([GATHER.pipeline(c), GATHER.outbound7(c)]);
  const m = out.match(/sent (\d+), opened (\d+), replied (\d+)/); const sent = m ? +m[1] : 0, replied = m ? +m[3] : 0;
  return `## Scoreboard\n- Pipeline: ${pipeline}\n- ${out}${sent ? `\n- Reply rate: ${Math.round((replied / sent) * 100)}% (${replied} of ${sent})` : ""}`;
}

export type RunResult = { id?: string; status: string; skipped?: boolean; title?: string };
export async function runRoutine(businessId: string, routineId: string, opts: { trigger?: "schedule" | "manual"; now?: Date } = {}): Promise<RunResult> {
  const spec = ROUTINES[routineId]; if (!spec) throw Object.assign(new Error("Unknown routine"), { statusCode: 404 });
  const { employee, routine } = spec; const trigger = opts.trigger ?? "schedule", now = opts.now ?? new Date();
  const business = await db.business.findUnique({ where: { id: businessId } }); if (!business) throw Object.assign(new Error("Business not found"), { statusCode: 404 });
  const tz = business.timezone || "UTC"; const key = periodKey(routine.cadence.period, localParts(now, tz));
  const where = { businessId_routine_periodKey: { businessId, routine: routineId, periodKey: key } };

  // Claim the period first: a second tick, or two servers, cannot run the same routine twice.
  let attempts = 1;
  const existing = await db.employeeRun.findUnique({ where });
  if (existing) {
    const age = now.getTime() - new Date(existing.finishedAt ?? existing.startedAt).getTime();
    const staleRunning = existing.status === "running" && age > 15 * 60_000;
    const retry = ["failed", "blocked"].includes(existing.status) && age > 60 * 60_000 && (existing.meta?.attempts ?? 1) < 3;
    if (trigger === "schedule" && !staleRunning && !retry) return { id: existing.id, status: existing.status, skipped: true };
    attempts = (existing.meta?.attempts ?? 1) + (trigger === "schedule" ? 1 : 0);
    await db.employeeRun.update({ where: { id: existing.id }, data: { status: "running", error: null, startedAt: now, finishedAt: null, trigger, meta: { attempts } } });
  } else {
    try { await db.employeeRun.create({ data: { businessId, employee: employee.id, routine: routineId, periodKey: key, status: "running", trigger, startedAt: now, meta: { attempts } } }); }
    catch (e: any) { if (e?.code === "P2002" || /unique/i.test(String(e?.message))) return { status: "running", skipped: true }; throw e; }
  }
  const run = await db.employeeRun.findUnique({ where });
  const finish = (data: any) => db.employeeRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ...data } });

  try {
    const cfg = (await safe(db.employeeSetting.findUnique({ where: { businessId_employee: { businessId, employee: "_all" } } }), null))?.config ?? {};
    const prevRun = routine.prelude === "site" ? await safe(db.employeeRun.findFirst({ where: { businessId, routine: routineId, status: "ok", NOT: { id: run.id } }, orderBy: { startedAt: "desc" } }), null) : null;
    const ctx: Ctx = { businessId, business, now, employee, website: cfg.website, prev: prevRun?.meta?.site };
    let siteData: SiteCheck | undefined;
    if (routine.prelude === "site" || routine.sources.includes("site")) {
      if (ctx.website) { siteData = await siteCheck(ctx.website); GATHER.site = async () => siteText(siteData!, ctx.prev); }
    }
    const blocks = await Promise.all(routine.sources.map(async (s) => `### ${s.toUpperCase()}\n${cut(await GATHER[s](ctx).catch(() => "unavailable"), 2600)}`));
    const prelude = routine.prelude === "scoreboard" ? await scoreboardText(ctx) : routine.prelude === "site" ? (ctx.website ? siteText(siteData!, ctx.prev) : "No website address set. Add it on the AI Employees page so this check can run.") : routine.prelude === "fleet" ? `## Fleet\n${(await fleetReport(businessId)).text}` : "";
    const metaBase = { attempts, ...(siteData && { site: siteData }) };

    if (routine.noAi || !routine.task) {
      const out = `# ${routine.title}\n${prelude}`;
      await finish({ status: "ok", title: routine.title, output: out, meta: metaBase });
      return { id: run.id, status: "ok", title: routine.title };
    }
    const json = routine.format === "posts";
    const prompt = `TASK: ${routine.task}\n\nDATA (${now.toISOString().slice(0, 10)}):\n${cut(blocks.join("\n\n"), 6000)}${prelude ? `\n\n${prelude}` : ""}`;
    const text = await withBusinessContext(businessId, () => complete({ system: json ? SYSTEM(employee, business).replace("Format: Markdown", "Format: JSON only (no Markdown). Ignore the Markdown format below. Original format: Markdown") : SYSTEM(employee, business), prompt, maxTokens: 1100, json }));
    let output = text.trim(); let drafts: string[] = [];
    if (json) {
      const j = parseJson(text);
      if (j && Array.isArray(j.posts)) {
        const ok = new Set(["linkedin", "facebook", "instagram", "x", "tiktok", "youtube"]);
        for (const p of j.posts.slice(0, 8)) {
          const ch = String(p?.channel ?? "").toLowerCase(), content = String(p?.content ?? "").trim().slice(0, 3000);
          if (!ok.has(ch) || !content) continue;
          const row = await db.socialPost.create({ data: { businessId, channel: ch, content, status: "draft" } }); drafts.push(row.id);
        }
        output = `# ${cut(j.headline || routine.title, 110)}\n${(j.posts as any[]).map((p) => `**${p?.channel}**\n${p?.content}`).join("\n\n")}\n\n## Needs you\n${(Array.isArray(j.needsYou) && j.needsYou.length ? j.needsYou : ["Review the drafts in Studio → Social, then publish the ones you like."]).map((x: string) => `- ${x}`).join("\n")}\n\n_${drafts.length} draft${drafts.length === 1 ? "" : "s"} saved as unpublished social posts._`;
      }
    }
    if (prelude && !json && !output.includes(prelude.slice(0, 20))) output = `${output}\n\n${prelude}`;
    await finish({ status: "ok", title: titleOf(output, routine.title), output, meta: { ...metaBase, drafts } });
    return { id: run.id, status: "ok", title: titleOf(output, routine.title) };
  } catch (err: any) {
    const raw = String(err?.message ?? err);
    const blocked = err instanceof NoAiKeyError || err?.name === "NoAiKeyError";
    const hint = blocked ? raw : explainAiError("", raw).hint;
    await finish({ status: blocked ? "blocked" : "failed", error: cut(`${hint} (${raw})`, 700), meta: { attempts } });
    return { id: run.id, status: blocked ? "blocked" : "failed" };
  }
}

// ── The scheduler entry point ─────────────────────────────────────────────────
let running = false;
export async function runDueEmployees(opts: { maxPerTick?: number; dailyCap?: number; now?: Date } = {}): Promise<number> {
  if (running) return 0; running = true;
  const max = opts.maxPerTick ?? 4, now = opts.now ?? new Date(); let started = 0;
  try {
    const settings: any[] = await db.employeeSetting.findMany({ where: { enabled: true, employee: { not: "_all" } }, take: 1000 });
    if (!settings.length) return 0;
    const byBiz = new Map<string, string[]>(); for (const s of settings) byBiz.set(s.businessId, [...(byBiz.get(s.businessId) ?? []), s.employee]);
    const biz: any[] = await db.business.findMany({ where: { id: { in: [...byBiz.keys()] } }, select: { id: true, timezone: true } });
    for (const b of biz) {
      const parts = localParts(now, b.timezone || "UTC");
      const all = (await safe(db.employeeSetting.findUnique({ where: { businessId_employee: { businessId: b.id, employee: "_all" } } }), null))?.config ?? {};
      const cap = opts.dailyCap ?? Math.min(40, Math.max(1, Number(all.maxRunsPerDay) || 12));
      let today = await safe(db.employeeRun.count({ where: { businessId: b.id, trigger: "schedule", startedAt: { gte: days(1, now) } } }), 0);
      for (const eid of byBiz.get(b.id) ?? []) {
        const emp = EMPLOYEES.find((e) => e.id === eid); if (!emp) continue;
        for (const r of emp.routines) {
          if (started >= max || today >= cap) break;
          if (!isDue(r, parts)) continue;
          const res = await runRoutine(b.id, r.id, { trigger: "schedule", now }).catch((e) => { console.error("[employees]", r.id, e?.message ?? e); return null; });
          if (res && !res.skipped) { started++; today++; }
        }
      }
      if (started >= max) break;
    }
  } finally { running = false; }
  return started;
}
