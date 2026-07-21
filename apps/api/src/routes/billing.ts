import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";
import { PLANS, PlanKey, createCheckout, createPortal, ensureCustomer } from "@leadhunter/integrations";

/** Subscription billing + usage. Checkout/portal via Stripe; plan drives limits. */
export async function billingRoutes(app: FastifyInstance) {
  // Stripe webhook is unauthenticated (signature-verified) — registered separately in webhooks.ts
  app.addHook("onRequest", (req) => app.authenticate(req));

  app.get("/billing/plans", async () => Object.entries(PLANS).map(([key, p]) => ({ key, ...p })));

  app.get("/billing/subscription", async (req) => {
    const sub = await prisma.subscription.findUnique({ where: { tenantId: req.auth!.tenantId } });
    const tenant = await prisma.tenant.findUnique({ where: { id: req.auth!.tenantId } });
    const plan = (sub?.plan ?? tenant?.plan ?? "TRIAL") as PlanKey;
    const period = new Date().toISOString().slice(0, 7);
    const usage = await prisma.usageCounter.findMany({ where: { tenantId: req.auth!.tenantId, period } });
    const used: Record<string, number> = {}; usage.forEach((u) => (used[u.metric] = u.count));
    return { plan, status: sub?.status ?? "trialing", limits: PLANS[plan].limits, usage: used, currentPeriodEnd: sub?.currentPeriodEnd };
  });

  app.post("/billing/checkout", async (req, reply) => {
    const { plan } = z.object({ plan: z.enum(["STARTER", "GROWTH", "SCALE"]) }).parse(req.body);
    const priceId = PLANS[plan].priceId;
    if (!priceId) return reply.code(400).send({ error: `No Stripe price configured for ${plan} (set STRIPE_PRICE_${plan}).` });
    const tenant = await prisma.tenant.findUnique({ where: { id: req.auth!.tenantId } });
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    const customerId = await ensureCustomer(tenant?.stripeCustomerId, user!.email, tenant?.name);
    if (customerId !== tenant?.stripeCustomerId) await prisma.tenant.update({ where: { id: tenant!.id }, data: { stripeCustomerId: customerId } });
    const session = await createCheckout(customerId, priceId, `${process.env.APP_URL}/billing?ok=1`, `${process.env.APP_URL}/billing`);
    return { url: session.url };
  });

  app.post("/billing/portal", async (req, reply) => {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.auth!.tenantId } });
    if (!tenant?.stripeCustomerId) return reply.code(400).send({ error: "No billing account yet — subscribe first." });
    const session = await createPortal(tenant.stripeCustomerId, `${process.env.APP_URL}/billing`);
    return { url: session.url };
  });
}
