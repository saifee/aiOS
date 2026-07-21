import { prisma } from "@leadhunter/db";
import { PLANS, PlanKey } from "@leadhunter/integrations";

/** Increment usage and return whether the tenant is still within plan limits. */
export async function consumeQuota(tenantId: string, metric: "leads" | "outreach" | "calls" | "agent_runs", n = 1) {
  const period = new Date().toISOString().slice(0, 7);
  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  const plan = (sub?.plan ?? "TRIAL") as PlanKey;
  const limitKey = metric === "agent_runs" ? "agents" : metric;
  const limit = (PLANS[plan].limits as any)[limitKey] ?? Infinity;
  const row = await prisma.usageCounter.upsert({
    where: { tenantId_period_metric: { tenantId, period, metric } },
    update: { count: { increment: n } }, create: { tenantId, period, metric, count: n },
  });
  return { allowed: row.count <= limit, count: row.count, limit, plan };
}
