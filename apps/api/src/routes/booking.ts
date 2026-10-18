import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";
import { sendEmail } from "@leadhunter/integrations";
import { BookingConfig, googleCalUrl, isDate, readConfig, slotsFor, slugify, token, toIcs, validTimezone, zonedToUtc } from "../lib/booking";

const db: any = prisma;
const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
const publicUrl = (slug: string) => `${appUrl()}/book?b=${slug}`;
const feedUrl = (t: string) => `${appUrl()}/v1/public/calendar/${t}.ics`;
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const configSchema = z.object({
  enabled: z.boolean(), title: z.string().trim().min(1).max(120), welcome: z.string().trim().max(500),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/, "Use 3–40 letters, numbers or dashes").optional(),
  timezone: z.string().refine(validTimezone, "Unknown time zone"),
  hours: z.record(z.string().regex(/^[0-6]$/), z.array(z.tuple([hhmm, hhmm]).refine(([a, b]) => a < b, "Start must be before end")).max(4)),
  types: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,30}$/), title: z.string().trim().min(1).max(80), minutes: z.number().int().min(10).max(480), description: z.string().max(300).optional() })).min(1).max(8),
  minNoticeHours: z.number().int().min(0).max(720), daysAhead: z.number().int().min(1).max(180), bufferMin: z.number().int().min(0).max(120),
  preferExternal: z.boolean(), notifyEmail: z.union([z.string().email(), z.literal("")]), joinUrl: z.union([z.string().url().max(300), z.literal("")]),
}).strict();

async function bySlug(slug: string) {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const biz = await db.business.findFirst({ where: { branding: { path: "$.booking.slug", equals: slug } } });
  if (!biz) return null;
  const cfg = readConfig(biz);
  return cfg.enabled ? { biz, cfg } : null;
}
async function byFeed(t: string) {
  if (!/^[\w-]{16,64}$/.test(t)) return null;
  return db.business.findFirst({ where: { branding: { path: "$.booking.feedToken", equals: t } } });
}
const dayRange = (date: string, tz: string) => ({ gte: new Date(zonedToUtc(date, "00:00", tz) - 86400_000), lte: new Date(zonedToUtc(date, "23:59", tz) + 86400_000) });
const fmt = (d: Date, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, dateStyle: "full", timeStyle: "short" }).format(d);
const icsHeaders = (reply: any, name: string) => reply.header("Content-Type", "text/calendar; charset=utf-8").header("Content-Disposition", `attachment; filename="${name}.ics"`).header("Cache-Control", "no-store");
const evt = (b: any, biz: any) => ({ uid: b.id, start: b.startsAt, end: b.endsAt, title: `${b.typeTitle}: ${b.name} · ${biz.name}`, description: [b.notes, b.email, b.phone].filter(Boolean).join("\n"), url: b.joinUrl || undefined, cancelled: b.status === "cancelled" });

async function notifyOwner(biz: any, cfg: BookingConfig, b: any) {
  try {
    const owners = await db.membership.findMany({ where: { tenantId: biz.tenantId, role: "OWNER" }, include: { user: true } });
    const when = fmt(b.startsAt, cfg.timezone);
    for (const o of owners) await db.notification.create({ data: { userId: o.userId, title: "New booking", body: `${b.name} booked ${b.typeTitle} on ${when}.`, kind: "booking", channels: [], meta: { bookingId: b.id, businessId: biz.id } } }).catch(() => {});
    const to = cfg.notifyEmail || owners[0]?.user?.email;
    if (to) await sendEmail({ to, subject: `New booking: ${b.name} · ${when}`, html: `<p><b>${b.name}</b> (${b.email}${b.phone ? ", " + b.phone : ""}) booked <b>${b.typeTitle}</b>.</p><p>${when} (${cfg.timezone})</p>${b.notes ? `<p>${String(b.notes).replace(/</g, "&lt;")}</p>` : ""}<p><a href="${appUrl()}/bookings">Open bookings</a></p>`, from: process.env.DEFAULT_FROM_EMAIL ?? "noreply@aios.app", unsubscribeUrl: `${appUrl()}/settings` });
  } catch { /* notifications are best-effort */ }
}
async function confirmGuest(biz: any, cfg: BookingConfig, b: any) {
  try {
    await sendEmail({ to: b.email, subject: `Confirmed: ${b.typeTitle} with ${biz.name}`, from: process.env.DEFAULT_FROM_EMAIL ?? "noreply@aios.app", unsubscribeUrl: `${appUrl()}/`,
      html: `<p>Hi ${String(b.name).replace(/</g, "&lt;")}, your booking is confirmed.</p><p><b>${b.typeTitle}</b><br>${fmt(b.startsAt, cfg.timezone)} (${cfg.timezone})</p>${b.joinUrl ? `<p>Join: <a href="${b.joinUrl}">${b.joinUrl}</a></p>` : ""}<p><a href="${googleCalUrl(`${b.typeTitle} · ${biz.name}`, b.startsAt, b.endsAt)}">Add to Google Calendar</a> · <a href="${appUrl()}/v1/public/booking/${b.token}.ics">Apple / Outlook (.ics)</a></p><p><a href="${appUrl()}/book?t=${b.token}">Change or cancel</a></p>` });
  } catch { /* guest still sees confirmation on screen */ }
}

export async function bookingRoutes(app: FastifyInstance) {
  // ───────── Public (no sign-in): the booking page the AI and you share ─────────
  const pub = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };
  app.get("/public/book/:slug", pub, async (req, reply) => {
    const r = await bySlug((req.params as any).slug);
    if (!r) return reply.code(404).send({ error: "This booking page is not available." });
    const { biz, cfg } = r;
    return { name: biz.name, title: cfg.title, welcome: cfg.welcome, timezone: cfg.timezone, types: cfg.types, daysAhead: cfg.daysAhead, openWeekdays: Object.entries(cfg.hours).filter(([, w]) => w.length).map(([d]) => +d) };
  });
  app.get("/public/book/:slug/slots", pub, async (req, reply) => {
    const r = await bySlug((req.params as any).slug);
    const q = z.object({ type: z.string().max(30), date: z.string().refine(isDate) }).safeParse(req.query);
    if (!r || !q.success) return reply.code(r ? 400 : 404).send({ error: r ? "Invalid request" : "This booking page is not available." });
    const type = r.cfg.types.find((t) => t.id === q.data.type);
    if (!type) return reply.code(400).send({ error: "Unknown meeting type" });
    const busy = await db.booking.findMany({ where: { businessId: r.biz.id, status: "confirmed", startsAt: dayRange(q.data.date, r.cfg.timezone) }, select: { startsAt: true, endsAt: true } });
    return { slots: slotsFor(r.cfg, type, q.data.date, busy) };
  });
  app.post("/public/book/:slug", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const r = await bySlug((req.params as any).slug);
    if (!r) return reply.code(404).send({ error: "This booking page is not available." });
    const b = z.object({ type: z.string().max(30), startsAt: z.string().datetime({ offset: true }), name: z.string().trim().min(1).max(120), email: z.string().trim().toLowerCase().email().max(190), phone: z.string().trim().max(40).optional(), notes: z.string().trim().max(1000).optional(), source: z.enum(["link", "ai"]).optional() }).strict().parse(req.body);
    const { biz, cfg } = r;
    const type = cfg.types.find((t) => t.id === b.type);
    if (!type) return reply.code(400).send({ error: "Unknown meeting type" });
    const start = new Date(b.startsAt);
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: cfg.timezone }).format(start); // YYYY-MM-DD in the business time zone
    const busy = await db.booking.findMany({ where: { businessId: biz.id, status: "confirmed", startsAt: dayRange(date, cfg.timezone) }, select: { startsAt: true, endsAt: true } });
    if (!slotsFor(cfg, type, date, busy).includes(start.toISOString())) return reply.code(409).send({ error: "That time is no longer available. Please pick another." });
    try {
      const row = await db.booking.create({ data: { businessId: biz.id, typeId: type.id, typeTitle: type.title, name: b.name, email: b.email, phone: b.phone || null, notes: b.notes || null, startsAt: start, endsAt: new Date(start.getTime() + type.minutes * 60_000), source: b.source ?? "link", token: token(), slotKey: `${biz.id}|${start.toISOString()}`, joinUrl: cfg.joinUrl || null } });
      void notifyOwner(biz, cfg, row); void confirmGuest(biz, cfg, row);
      return reply.code(201).send({ token: row.token, startsAt: row.startsAt, endsAt: row.endsAt, typeTitle: row.typeTitle, timezone: cfg.timezone, joinUrl: row.joinUrl, icsUrl: `/v1/public/booking/${row.token}.ics`, googleUrl: googleCalUrl(`${row.typeTitle} · ${biz.name}`, row.startsAt, row.endsAt) });
    } catch (e: any) {
      if (e?.code === "P2002") return reply.code(409).send({ error: "That time was just taken. Please pick another." });
      throw e;
    }
  });
  // Guest's own booking: look up, download .ics, cancel (the private token is the credential).
  app.get("/public/booking/:token", pub, async (req, reply) => {
    const row = await db.booking.findUnique({ where: { token: String((req.params as any).token).replace(/\.ics$/, "") }, include: { business: true } });
    if (!row) return reply.code(404).send({ error: "Booking not found" });
    const cfg = readConfig(row.business);
    if (String((req.params as any).token).endsWith(".ics")) return icsHeaders(reply, "booking").send(toIcs(row.business.name, [{ ...evt(row, row.business), title: `${row.typeTitle} · ${row.business.name}` }]));
    return { name: row.business.name, typeTitle: row.typeTitle, startsAt: row.startsAt, endsAt: row.endsAt, status: row.status, timezone: cfg.timezone, joinUrl: row.joinUrl, icsUrl: `/v1/public/booking/${row.token}.ics`, googleUrl: googleCalUrl(`${row.typeTitle} · ${row.business.name}`, row.startsAt, row.endsAt) };
  });
  app.post("/public/booking/:token/cancel", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const row = await db.booking.findUnique({ where: { token: (req.params as any).token }, include: { business: true } });
    if (!row) return reply.code(404).send({ error: "Booking not found" });
    await db.booking.update({ where: { id: row.id }, data: { status: "cancelled", slotKey: null } });
    void notifyOwner(row.business, readConfig(row.business), { ...row, typeTitle: `${row.typeTitle} (CANCELLED)` });
    return { ok: true };
  });
  // Subscribe from Google / Outlook / Apple Calendar. The long random token in the URL is the credential.
  app.get("/public/calendar/:feed", pub, async (req, reply) => {
    const biz = await byFeed(String((req.params as any).feed).replace(/\.ics$/, ""));
    if (!biz) return reply.code(404).send({ error: "Not found" });
    const rows = await db.booking.findMany({ where: { businessId: biz.id, startsAt: { gte: new Date(Date.now() - 30 * 86400_000) } }, orderBy: { startsAt: "asc" }, take: 1000 });
    return icsHeaders(reply, "bookings").send(toIcs(`${biz.name} bookings`, rows.map((x: any) => evt(x, biz))));
  });

  // ───────── Signed-in: manage settings and see bookings ─────────
  app.register(async (priv) => {
    priv.addHook("onRequest", (req) => app.authenticate(req));

    priv.get("/businesses/:businessId/booking", async (req) => {
      const { businessId } = req.params as any; await app.requireBusiness(req, businessId);
      const biz = await db.business.findUnique({ where: { id: businessId } });
      const cfg = readConfig(biz);
      return { config: { ...cfg, feedToken: undefined }, publicUrl: cfg.slug ? publicUrl(cfg.slug) : null, feedUrl: cfg.feedToken ? feedUrl(cfg.feedToken) : null, externalUrl: biz.calendarLink ?? null };
    });
    priv.put("/businesses/:businessId/booking", async (req, reply) => {
      const { businessId } = req.params as any; await app.requireBusiness(req, businessId); app.requireRole(req, "OWNER", "ADMIN");
      const body = configSchema.parse(req.body);
      const biz = await db.business.findUnique({ where: { id: businessId } });
      const prev = readConfig(biz);
      const slug = body.slug || prev.slug || `${slugify(biz.name)}-${token(3).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
      if (slug !== prev.slug && await db.business.findFirst({ where: { id: { not: businessId }, branding: { path: "$.booking.slug", equals: slug } } }))
        return reply.code(409).send({ error: "That link name is taken. Try another." });
      if (new Set(body.types.map((t) => t.id)).size !== body.types.length) return reply.code(400).send({ error: "Each meeting type needs a unique id." });
      const { slug: _s, ...rest } = body;
      const branding = { ...((biz.branding as any) ?? {}), booking: { ...rest, slug, feedToken: prev.feedToken || token(24) } };
      await db.business.update({ where: { id: businessId }, data: { branding } });
      const cfg = readConfig({ ...biz, branding });
      return { ok: true, publicUrl: publicUrl(slug), feedUrl: feedUrl(cfg.feedToken) };
    });
    priv.get("/businesses/:businessId/bookings", async (req) => {
      const { businessId } = req.params as any; await app.requireBusiness(req, businessId);
      const q = z.object({ scope: z.enum(["upcoming", "past", "all"]).default("upcoming") }).parse(req.query);
      const now = new Date();
      return db.booking.findMany({ where: { businessId, ...(q.scope === "upcoming" ? { startsAt: { gte: now }, status: "confirmed" } : q.scope === "past" ? { startsAt: { lt: now } } : {}) }, orderBy: { startsAt: q.scope === "past" ? "desc" : "asc" }, take: 300, select: { id: true, typeTitle: true, name: true, email: true, phone: true, notes: true, startsAt: true, endsAt: true, status: true, source: true, joinUrl: true } });
    });
    priv.post("/businesses/:businessId/bookings/:id/cancel", async (req, reply) => {
      const { businessId, id } = req.params as any; await app.requireBusiness(req, businessId);
      const row = await db.booking.findFirst({ where: { id, businessId } });
      if (!row) return reply.code(404).send({ error: "Booking not found" });
      await db.booking.update({ where: { id }, data: { status: "cancelled", slotKey: null } });
      return { ok: true };
    });
    // One-off download of everything (upcoming + recent) as an .ics file.
    priv.get("/businesses/:businessId/bookings.ics", async (req, reply) => {
      const { businessId } = req.params as any; await app.requireBusiness(req, businessId);
      const biz = await db.business.findUnique({ where: { id: businessId } });
      const rows = await db.booking.findMany({ where: { businessId, status: "confirmed", startsAt: { gte: new Date(Date.now() - 30 * 86400_000) } }, orderBy: { startsAt: "asc" }, take: 1000 });
      return icsHeaders(reply, "bookings").send(toIcs(`${biz.name} bookings`, rows.map((x: any) => evt(x, biz))));
    });
  });
}
