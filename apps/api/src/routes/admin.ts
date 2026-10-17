import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";
import { PLANS } from "@leadhunter/integrations";
import { invalidatePlan } from "@leadhunter/agents";
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
  app.get("/admin/users", async (req) => {
    const { q, page } = z.object({ q: z.string().max(100).optional(), page: z.coerce.number().int().min(1).max(10_000).default(1) }).parse(req.query);
    const where = q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : {};
    const [total, users] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where, orderBy: { createdAt: "desc" }, take: 50, skip: (page - 1) * 50,
        select: { id: true, email: true, name: true, createdAt: true, memberships: { select: { role: true, tenant: { select: { id: true, name: true, plan: true } } } } },
      }),
    ]);
    const tenantIds = [...new Set(users.flatMap((u: any) => u.memberships.map((m: any) => m.tenant.id)))] as string[];
    const subs = tenantIds.length ? await db.subscription.findMany({ where: { tenantId: { in: tenantIds } } }) : [];
    const subBy = new Map<string, any>(subs.map((s: any) => [s.tenantId, s]));
    return {
      total, page,
      users: users.map((u: any) => ({
        id: u.id, email: u.email, name: u.name, createdAt: u.createdAt,
        workspaces: u.memberships.map((m: any) => {
          const s = subBy.get(m.tenant.id);
          return { id: m.tenant.id, name: m.tenant.name, role: m.role, plan: s?.plan ?? m.tenant.plan, status: s?.status ?? "none", currentPeriodEnd: s?.currentPeriodEnd ?? null };
        }),
      })),
    };
  });

  // ── One workspace: members, subscription, payments ─────────
  app.get("/admin/tenants/:id", async (req, reply) => {
    const { id } = Id.parse(req.params);
    const t = await db.tenant.findUnique({ where: { id }, select: { id: true, name: true, plan: true, createdAt: true, stripeCustomerId: true, users: { select: { role: true, user: { select: { id: true, email: true, name: true } } } } } });
    if (!t) return reply.code(404).send({ error: "Workspace not found" });
    const [sub, payments] = await Promise.all([
      db.subscription.findUnique({ where: { tenantId: id } }),
      db.payment.findMany({ where: { tenantId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    return {
      id: t.id, name: t.name, plan: sub?.plan ?? t.plan, createdAt: t.createdAt, stripeCustomer: !!t.stripeCustomerId,
      members: t.users.map((m: any) => ({ role: m.role, ...m.user })),
      subscription: sub ? { plan: sub.plan, status: sub.status, seats: sub.seats, currentPeriodEnd: sub.currentPeriodEnd, viaStripe: !!sub.stripeSubscriptionId } : null,
      payments,
    };
  });

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
    await db.tenant.update({ where: { id }, data: { plan: b.plan } });
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
      await db.tenant.update({ where: { id }, data: { plan: b.activatePlan } });
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
}
