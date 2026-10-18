import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";
import { PLANS } from "@leadhunter/integrations";
import { invalidatePlan, loadEmailSetting, saveEmailSetting, emailAdminView, emailRuntime } from "@leadhunter/agents";
import { sendEmail, EMAIL_PROVIDERS } from "@leadhunter/integrations";
import argon2 from "../lib/password";
import { weakPassword } from "../lib/passwords";
import { INVITE_DAYS, hashToken, inviteHtml, joinLink, newInviteToken } from "../lib/invites";
import { requireSuperAdmin } from "../lib/superadmin";
import { loadPaymentConfig, savePaymentConfig, adminView } from "../lib/payments";

const db: any = prisma;
const PLAN_KEYS = Object.keys(PLANS) as [string, ...string[]];
const STATUSES = ["trialing", "active", "past_due", "canceled"] as const;
const Id = z.object({ id: z.string().min(1).max(64) });

/**
 * Platform administration. Every route here requires the caller to be a platform superadmin
 * (see lib/superadmin.ts) — workspace OWNER/ADMIN roles are NOT enough. Each change is written
 * to the audit log of the affected workspace.
 */
export async function adminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (req) => { await app.authenticate(req); await requireSuperAdmin(req.auth!.userId); });

  const audit = (tenantId: string, actor: string, action: string, target: string | null, detail: unknown) =>
    db.auditLog.create({ data: { tenantId, actor, action, target, detail } }).catch(() => {});

  // ── Users (with their workspaces + subscription) ───────────
  app.get("/admin/users", async (req, reply) => {
    const { q, page } = z.object({ q: z.string().max(100).optional(), page: z.coerce.number().int().min(1).max(10_000).default(1) }).parse(req.query);
    try {
      return await listUsers(q, page);
    } catch (err: any) {
      req.log.error({ err }, "admin/users primary query failed, trying raw fallback");
      try {
        return await listUsersRaw(q, page);
      } catch (err2: any) {
        req.log.error({ err: err2 }, "admin/users fallback failed");
        // Superadmin-only route: showing the real reason is safe and makes the problem fixable.
        return reply.code(500).send({ error: `Could not load users: ${String(err2?.message || err?.message || "unknown").split("\n").filter(Boolean).slice(-1)[0].slice(0, 300)}` });
      }
    }
  });

  async function listUsers(q: string | undefined, page: number) {
    const where = q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : {};
    const [total, users] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where, orderBy: { createdAt: "desc" }, take: 50, skip: (page - 1) * 50,
        select: { id: true, email: true, name: true, createdAt: true, memberships: { select: { role: true, tenant: { select: { id: true, name: true, plan: true } } } } },
      }),
    ]);
    const tenantIds = [...new Set(users.flatMap((u: any) => u.memberships.map((m: any) => m.tenant.id)))] as string[];
    // A subscription lookup problem must not hide the user list.
    const subs = tenantIds.length ? await db.subscription.findMany({ where: { tenantId: { in: tenantIds } } }).catch(() => []) : [];
    const subBy = new Map<string, any>(subs.map((s: any) => [s.tenantId, s]));
    return {
      total, page,
      users: users.map((u: any) => ({
        id: u.id, email: u.email, name: u.name, createdAt: u.createdAt,
        workspaces: u.memberships.filter((m: any) => m.tenant).map((m: any) => {
          const s = subBy.get(m.tenant.id);
          return { id: m.tenant.id, name: m.tenant.name, role: m.role, plan: s?.plan ?? m.tenant.plan, status: s?.status ?? "none", currentPeriodEnd: s?.currentPeriodEnd ?? null };
        }),
      })),
    };
  }

  // Plain-SQL fallback: tolerates odd data (e.g. an enum value Prisma can't map) and older table layouts.
  async function listUsersRaw(q: string | undefined, page: number) {
    const like = q ? `%${q}%` : null;
    const w = like ? "WHERE email LIKE ? OR name LIKE ?" : "";
    const args = like ? [like, like] : [];
    const totalRows: any[] = await db.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`User\` ${w}`, ...args);
    const rows: any[] = await db.$queryRawUnsafe(`SELECT id, email, name, createdAt FROM \`User\` ${w} ORDER BY createdAt DESC LIMIT 50 OFFSET ${(page - 1) * 50}`, ...args);
    const ids = rows.map((r) => String(r.id));
    const ms: any[] = ids.length
      ? await db.$queryRawUnsafe(`SELECT m.userId AS userId, CAST(m.role AS CHAR) AS role, t.id AS tid, t.name AS tname, CAST(t.plan AS CHAR) AS tplan FROM \`Membership\` m JOIN \`Tenant\` t ON t.id = m.tenantId WHERE m.userId IN (${ids.map(() => "?").join(",")})`, ...ids)
      : [];
    const tids = [...new Set(ms.map((m) => String(m.tid)))];
    const subs: any[] = tids.length
      ? await db.$queryRawUnsafe(`SELECT tenantId, CAST(plan AS CHAR) AS plan, status, currentPeriodEnd FROM \`Subscription\` WHERE tenantId IN (${tids.map(() => "?").join(",")})`, ...tids).catch(() => [])
      : [];
    const subBy = new Map<string, any>(subs.map((s) => [String(s.tenantId), s]));
    return {
      total: Number(totalRows[0]?.c ?? rows.length), page,
      users: rows.map((u) => ({
        id: u.id, email: u.email, name: u.name, createdAt: u.createdAt,
        workspaces: ms.filter((m) => m.userId === u.id).map((m) => {
          const s = subBy.get(String(m.tid));
          return { id: m.tid, name: m.tname, role: m.role, plan: s?.plan ?? m.tplan, status: s?.status ?? "none", currentPeriodEnd: s?.currentPeriodEnd ?? null };
        }),
      })),
    };
  }

  // ── One workspace: members, subscription, payments ─────────
  app.get("/admin/tenants/:id", async (req, reply) => {
    const { id } = Id.parse(req.params);
    let t: any, sub: any = null, payments: any[] = [];
    try {
      t = await db.tenant.findUnique({ where: { id }, select: { id: true, name: true, plan: true, createdAt: true, stripeCustomerId: true, users: { select: { role: true, user: { select: { id: true, email: true, name: true } } } } } });
    } catch (err: any) {
      // Plain-SQL fallback (e.g. a Tenant.plan value Prisma cannot map).
      req.log.error({ err }, "admin/tenants primary query failed, trying raw fallback");
      const rows: any[] = await db.$queryRawUnsafe("SELECT id, name, CAST(plan AS CHAR) AS plan, createdAt, stripeCustomerId FROM `Tenant` WHERE id = ? LIMIT 1", id);
      if (rows[0]) {
        const ms: any[] = await db.$queryRawUnsafe("SELECT CAST(m.role AS CHAR) AS role, u.id AS uid, u.email AS email, u.name AS uname FROM `Membership` m JOIN `User` u ON u.id = m.userId WHERE m.tenantId = ?", id);
        t = { ...rows[0], users: ms.map((m) => ({ role: m.role, user: { id: m.uid, email: m.email, name: m.uname } })) };
      }
    }
    if (!t) return reply.code(404).send({ error: "Workspace not found" });
    try { sub = await db.subscription.findUnique({ where: { tenantId: id } }); }
    catch (err: any) {
      req.log.error({ err }, "admin/tenants subscription read failed, trying raw");
      const r: any[] = await db.$queryRawUnsafe("SELECT CAST(plan AS CHAR) AS plan, status, seats, currentPeriodEnd, stripeSubscriptionId FROM `Subscription` WHERE tenantId = ? LIMIT 1", id).catch(() => []);
      sub = r[0] ?? null;
    }
    try { payments = await db.payment.findMany({ where: { tenantId: id }, orderBy: { createdAt: "desc" }, take: 100 }); }
    catch (err: any) { req.log.error({ err }, "admin/tenants payments read failed"); payments = []; }
    return {
      id: t.id, name: t.name, plan: sub?.plan ?? t.plan, createdAt: t.createdAt, stripeCustomer: !!t.stripeCustomerId,
      members: t.users.map((m: any) => ({ role: m.role, ...m.user })),
      subscription: sub ? { plan: sub.plan, status: sub.status, seats: sub.seats, currentPeriodEnd: sub.currentPeriodEnd, viaStripe: !!sub.stripeSubscriptionId } : null,
      payments,
    };
  });

  // Keep Tenant.plan in step with the subscription; never let that mirror column block the real change.
  async function setTenantPlan(id: string, plan: string, log: any) {
    try { await db.tenant.update({ where: { id }, data: { plan } }); }
    catch (err: any) {
      log.error({ err }, "tenant.plan update failed, trying raw");
      await db.$executeRawUnsafe("UPDATE `Tenant` SET plan = ? WHERE id = ?", plan, id).catch(() => {});
    }
  }

  // ── Allocate / change a subscription ───────────────────────
  app.put("/admin/tenants/:id/subscription", async (req, reply) => {
    const { id } = Id.parse(req.params);
    const b = z.object({
      plan: z.enum(PLAN_KEYS), status: z.enum(STATUSES).default("active"),
      currentPeriodEnd: z.string().datetime().nullable().optional(), seats: z.number().int().min(1).max(10_000).optional(),
    }).parse(req.body);
    const t = await db.tenant.findUnique({ where: { id }, select: { id: true } });
    if (!t) return reply.code(404).send({ error: "Workspace not found" });
    const end = b.currentPeriodEnd === undefined ? undefined : b.currentPeriodEnd ? new Date(b.currentPeriodEnd) : null;
    const data = { plan: b.plan, status: b.status, ...(end !== undefined && { currentPeriodEnd: end }), ...(b.seats && { seats: b.seats }) };
    const sub = await db.subscription.upsert({ where: { tenantId: id }, update: data, create: { tenantId: id, ...data } });
    await setTenantPlan(id, b.plan, req.log);
    invalidatePlan(id);
    await audit(id, req.auth!.userId, "admin.subscription.set", id, { plan: b.plan, status: b.status, currentPeriodEnd: end ?? null });
    return { ok: true, subscription: { plan: sub.plan, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd } };
  });

  // ── Manual payments ────────────────────────────────────────
  app.post("/admin/tenants/:id/payments", async (req, reply) => {
    const { id } = Id.parse(req.params);
    const b = z.object({
      amount: z.number().positive().max(10_000_000), currency: z.string().regex(/^[A-Za-z]{3}$/).default("USD"),
      method: z.enum(["manual", "bank_transfer", "cash", "stripe", "other"]).default("manual"),
      reference: z.string().max(190).optional(), note: z.string().max(190).optional(),
      activatePlan: z.enum(PLAN_KEYS).optional(), months: z.number().int().min(1).max(60).optional(),
    }).parse(req.body);
    const t = await db.tenant.findUnique({ where: { id }, select: { id: true } });
    if (!t) return reply.code(404).send({ error: "Workspace not found" });
    const payment = await db.payment.create({
      data: { tenantId: id, amountCents: Math.round(b.amount * 100), currency: b.currency.toUpperCase(), method: b.method, reference: b.reference, note: b.note, plan: b.activatePlan, months: b.months, recordedBy: req.auth!.userId },
    });
    let periodEnd: Date | null = null;
    if (b.activatePlan) {
      // Extend from the later of now / the current paid-until date.
      const cur = await db.subscription.findUnique({ where: { tenantId: id } });
      const base = cur?.currentPeriodEnd && new Date(cur.currentPeriodEnd) > new Date() ? new Date(cur.currentPeriodEnd) : new Date();
      periodEnd = new Date(base); periodEnd.setMonth(periodEnd.getMonth() + (b.months ?? 1));
      const data = { plan: b.activatePlan, status: "active", currentPeriodEnd: periodEnd };
      await db.subscription.upsert({ where: { tenantId: id }, update: data, create: { tenantId: id, ...data } });
      await setTenantPlan(id, b.activatePlan, req.log);
      invalidatePlan(id);
    }
    await audit(id, req.auth!.userId, "admin.payment.record", payment.id, { amountCents: payment.amountCents, currency: payment.currency, method: b.method, plan: b.activatePlan ?? null });
    return { ok: true, payment, currentPeriodEnd: periodEnd };
  });

  app.get("/admin/payments", async () => db.payment.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { tenant: { select: { id: true, name: true } } } }));

  // ── Payment methods (Stripe + manual/other) ────────────────
  app.get("/admin/payment-methods", async () => adminView(await loadPaymentConfig(true)));
  app.put("/admin/payment-methods", async (req, reply) => {
    const price = z.string().max(100).regex(/^price_[A-Za-z0-9_]+$/, "Price IDs look like price_123").or(z.literal(""));
    const b = z.object({
      stripe: z.object({
        enabled: z.boolean(), publishableKey: z.string().max(200).regex(/^(pk_(live|test)_[A-Za-z0-9]+)?$/, "Publishable keys start with pk_").optional(),
        secretKey: z.string().max(300).regex(/^(sk|rk)_(live|test)_[A-Za-z0-9]+$/, "Secret keys start with sk_ or rk_").optional().or(z.literal("")),
        webhookSecret: z.string().max(300).regex(/^whsec_[A-Za-z0-9]+$/, "Webhook secrets start with whsec_").optional().or(z.literal("")),
        prices: z.object({ STARTER: price.optional(), GROWTH: price.optional(), SCALE: price.optional() }).optional(),
      }).optional(),
      manual: z.array(z.object({
        id: z.string().max(40).optional(), type: z.enum(["bank_transfer", "cash", "paypal", "wallet", "other"]),
        label: z.string().min(1).max(60), instructions: z.string().max(1000).default(""), enabled: z.boolean().default(true),
      })).max(20).optional(),
    }).parse(req.body);
    try { const cfg = await savePaymentConfig(b as any); await audit((await db.membership.findFirst({ where: { userId: req.auth!.userId }, select: { tenantId: true } }))?.tenantId ?? "", req.auth!.userId, "admin.payment-methods.update", null, { stripeEnabled: cfg.stripe.enabled, manual: cfg.manual.length }); return { ok: true, ...adminView(cfg) }; }
    catch (e: any) { return reply.code(e.statusCode ?? 500).send({ error: e.message }); }
  });

  // ── Email provider (system + invitation mail) ──────────────
  const emailBody = z.object({
    enabled: z.boolean(), provider: z.enum(EMAIL_PROVIDERS),
    fromEmail: z.string().trim().email().max(254), fromName: z.string().trim().max(80).optional(), replyTo: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
    user: z.string().trim().max(254).optional(), host: z.string().trim().max(253).regex(/^[A-Za-z0-9.-]*$/, "Enter a host name such as smtp.example.com").optional(),
    port: z.number().int().min(1).max(65535).optional(), secure: z.boolean().optional(),
    domain: z.string().trim().max(253).regex(/^[A-Za-z0-9.-]*$/).optional(), region: z.enum(["us", "eu"]).optional(),
    secret: z.string().max(500).optional(), secret2: z.string().max(500).optional(),
  }).strict();

  app.get("/admin/email", async () => emailAdminView(await loadEmailSetting(true)));
  app.put("/admin/email", async (req, reply) => {
    const b = emailBody.parse(req.body);
    const cur = await loadEmailSetting(true);
    if (b.enabled) {
      const smtpLike = ["smtp", "gmail", "outlook", "maileroo"].includes(b.provider);
      const have = (v?: string, stored?: boolean) => !!v || !!stored;
      const same = cur?.provider === b.provider;
      if (b.provider === "smtp" && !b.host) return reply.code(400).send({ error: "Enter the SMTP server host." });
      if (smtpLike && !b.user) return reply.code(400).send({ error: "Enter the username (usually the full email address)." });
      if (!have(b.secret, same && !!cur?.secretEnc)) return reply.code(400).send({ error: smtpLike ? "Enter the password (for Gmail / Outlook use an app password)." : "Enter the API key." });
      if (b.provider === "mailjet" && !have(b.secret2, same && !!cur?.secret2Enc)) return reply.code(400).send({ error: "Mailjet needs both the API key and the secret key." });
      if (b.provider === "mailgun" && !b.domain) return reply.code(400).send({ error: "Enter your Mailgun sending domain." });
    }
    await saveEmailSetting({ ...b, replyTo: b.replyTo || undefined });
    await audit("platform", req.auth!.userId, "admin.email.set", b.provider, { provider: b.provider, enabled: b.enabled, fromEmail: b.fromEmail });
    return emailAdminView(await loadEmailSetting(true));
  });
  app.post("/admin/email/test", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { to } = z.object({ to: z.string().trim().email().max(254) }).parse(req.body);
    try {
      const cfgOk = await emailRuntime();
      const out = await sendEmail({ to, subject: "aiOS test email", html: "<p>This is a test message from aiOS. If you can read it, system email is working.</p>", from: cfgOk?.fromEmail ?? process.env.DEFAULT_FROM_EMAIL ?? "noreply@aios.app", system: true });
      return { ok: true, provider: out.provider };
    } catch (e: any) { return reply.code(400).send({ error: String(e?.message ?? "Send failed").slice(0, 400) }); }
  });

  // ── Invitations ────────────────────────────────────────────
  const inviteBody = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    tenantId: z.string().min(1).max(64).optional(), workspace: z.string().trim().min(1).max(120).optional(),
    role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
  }).strict().refine((v) => !!v.tenantId !== !!v.workspace, "Choose an existing workspace or name a new one");

  async function deliver(inv: any, token: string, inviterId: string) {
    const inviter = await db.user.findUnique({ where: { id: inviterId }, select: { name: true, email: true } });
    const ws = inv.tenantId ? (await db.tenant.findUnique({ where: { id: inv.tenantId }, select: { name: true } }))?.name : inv.workspace;
    const link = joinLink(token);
    try {
      const cfg = await emailRuntime();
      await sendEmail({ to: inv.email, subject: `${inviter?.name || "An administrator"} invited you to aiOS`, system: true,
        html: inviteHtml({ inviter: inviter?.name || inviter?.email || "An administrator", workspace: ws || "aiOS", role: inv.tenantId ? inv.role : undefined, link, days: INVITE_DAYS }),
        from: cfg?.fromEmail ?? process.env.DEFAULT_FROM_EMAIL ?? "noreply@aios.app" });
      return { link, emailSent: true as const };
    } catch (e: any) { return { link, emailSent: false as const, emailError: String(e?.message ?? "Could not send").slice(0, 300) }; }
  }

  app.get("/admin/invites", async () => {
    const rows = await db.invite.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    const tIds = [...new Set(rows.map((r: any) => r.tenantId).filter(Boolean))] as string[];
    const ts = tIds.length ? await db.tenant.findMany({ where: { id: { in: tIds } }, select: { id: true, name: true } }) : [];
    const name = new Map<string, string>(ts.map((t: any) => [t.id, t.name]));
    return rows.map((r: any) => ({ id: r.id, email: r.email, role: r.tenantId ? r.role : "OWNER", workspace: r.tenantId ? name.get(r.tenantId) ?? "(deleted)" : `${r.workspace} (new)`,
      status: r.acceptedAt ? "accepted" : new Date(r.expiresAt) < new Date() ? "expired" : "pending", expiresAt: r.expiresAt, createdAt: r.createdAt }));
  });

  app.post("/admin/invites", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const b = inviteBody.parse(req.body);
    if (b.tenantId) {
      const t = await db.tenant.findUnique({ where: { id: b.tenantId }, select: { id: true } });
      if (!t) return reply.code(404).send({ error: "Workspace not found" });
      const u = await db.user.findUnique({ where: { email: b.email }, select: { id: true } });
      if (u && await db.membership.findFirst({ where: { tenantId: b.tenantId, userId: u.id }, select: { id: true } })) return reply.code(409).send({ error: "That person is already in this workspace." });
    }
    const token = newInviteToken();
    const inv = await db.invite.create({ data: { email: b.email, tenantId: b.tenantId ?? null, workspace: b.workspace ?? null, role: b.role, tokenHash: hashToken(token), invitedBy: req.auth!.userId, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) } });
    await audit(b.tenantId ?? "platform", req.auth!.userId, "admin.invite.create", inv.id, { email: b.email, role: b.role });
    return reply.code(201).send({ id: inv.id, ...(await deliver(inv, token, req.auth!.userId)) });
  });

  // New link + new email (the old link stops working)
  app.post("/admin/invites/:id/resend", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { id } = Id.parse(req.params);
    const inv = await db.invite.findUnique({ where: { id } });
    if (!inv || inv.acceptedAt) return reply.code(404).send({ error: "Invitation not found or already accepted." });
    const token = newInviteToken();
    const next = await db.invite.update({ where: { id }, data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) } });
    return { id, ...(await deliver(next, token, req.auth!.userId)) };
  });
  app.delete("/admin/invites/:id", async (req, reply) => {
    const { id } = Id.parse(req.params);
    const r = await db.invite.deleteMany({ where: { id, acceptedAt: null } });
    if (!r.count) return reply.code(404).send({ error: "Invitation not found or already accepted." });
    return { ok: true };
  });

  // ── Add a user directly (no email step) ────────────────────
  app.post("/admin/users", async (req, reply) => {
    const b = z.object({
      email: z.string().trim().toLowerCase().email().max(254), name: z.string().trim().min(1).max(120), password: z.string().min(10).max(200),
      tenantId: z.string().min(1).max(64).optional(), workspace: z.string().trim().min(1).max(120).optional(), role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
    }).strict().refine((v) => !!v.tenantId !== !!v.workspace, "Choose an existing workspace or name a new one").parse(req.body);
    const weak = weakPassword(b.password, b.email, b.name);
    if (weak) return reply.code(400).send({ error: weak });
    if (await db.user.findUnique({ where: { email: b.email }, select: { id: true } })) return reply.code(409).send({ error: "An account with this email already exists." });
    if (b.tenantId && !(await db.tenant.findUnique({ where: { id: b.tenantId }, select: { id: true } }))) return reply.code(404).send({ error: "Workspace not found" });
    const passwordHash = await argon2.hash(b.password);
    const slug = (b.workspace ?? "ws").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + Date.now().toString(36);
    const u = await db.user.create({ data: { email: b.email, name: b.name, passwordHash, memberships: { create: b.tenantId ? { role: b.role, tenantId: b.tenantId } : { role: "OWNER", tenant: { create: { name: b.workspace!, slug } } } } }, include: { memberships: true } });
    await audit(u.memberships[0].tenantId, req.auth!.userId, "admin.user.create", u.id, { email: b.email });
    return reply.code(201).send({ id: u.id, email: u.email });
  });
}
