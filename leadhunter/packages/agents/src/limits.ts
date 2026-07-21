import { prisma } from "@leadhunter/db";
import { PLANS, PlanKey } from "@leadhunter/integrations";

type Metric = "leads" | "outreach" | "calls";

/**
 * Plan-limit enforcement. Checks the tenant's monthly usage against its plan
 * BEFORE consuming; only increments when the action is allowed, so counters
 * never drift past the limit. Call this at every metered action.
 */
export async function consumeQuota(tenantId: string, metric: Metric, n = 1) {
  const period = new Date().toISOString().slice(0, 7); // e.g. "2026-07"
  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  const plan = (sub?.plan ?? "TRIAL") as PlanKey;
  const limit = (PLANS[plan].limits as any)[metric] ?? Infinity;

  const existing = await prisma.usageCounter.findUnique({ where: { tenantId_period_metric: { tenantId, period, metric } } });
  const current = existing?.count ?? 0;
  if (current + n > limit) return { allowed: false, count: current, limit, plan };

  const row = await prisma.usageCounter.upsert({
    where: { tenantId_period_metric: { tenantId, period, metric } },
    update: { count: { increment: n } },
    create: { tenantId, period, metric, count: n },
  });
  return { allowed: true, count: row.count, limit, plan };
}

/** Read-only check (no increment) — for gating before expensive work. */
export async function checkQuota(tenantId: string, metric: Metric) {
  const period = new Date().toISOString().slice(0, 7);
  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  const plan = (sub?.plan ?? "TRIAL") as PlanKey;
  const limit = (PLANS[plan].limits as any)[metric] ?? Infinity;
  const row = await prisma.usageCounter.findUnique({ where: { tenantId_period_metric: { tenantId, period, metric } } });
  const count = row?.count ?? 0;
  return { allowed: count < limit, count, limit, plan };
}
