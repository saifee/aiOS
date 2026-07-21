import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";

/**
 * Business Intelligence — live financial + operational metrics computed from
 * the system of record (leads, proposals, invoices, projects, tasks, calls,
 * agent runs). Real-time; no manual data entry.
 */
export async function biRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));

  app.get("/businesses/:businessId/bi/overview", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const last6 = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (5 - i), 1));

    const [paidMTD, paidAll, overdue, draftSent, expensesMTD, wonMTD, pipeline, projects, tasks, callsMonth, agentRuns, recurring] = await Promise.all([
      prisma.invoice.aggregate({ where: { businessId, status: "paid", paidAt: { gte: monthStart } }, _sum: { amount: true } }),
      prisma.invoice.aggregate({ where: { businessId, status: "paid" }, _sum: { amount: true }, _count: true }),
      prisma.invoice.aggregate({ where: { businessId, status: "overdue" }, _sum: { amount: true }, _count: true }),
      prisma.invoice.aggregate({ where: { businessId, status: { in: ["sent", "draft"] } }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { businessId, incurredAt: { gte: monthStart } }, _sum: { amount: true } }),
      prisma.lead.count({ where: { businessId, stage: "WON", updatedAt: { gte: monthStart } } }),
      prisma.lead.groupBy({ by: ["stage"], where: { businessId, stage: { in: ["QUALIFIED", "CONTACTED", "REPLIED", "INTERESTED", "MEETING_SCHEDULED", "PROPOSAL_SENT", "NEGOTIATION"] } }, _count: true }),
      prisma.project.groupBy({ by: ["health"], where: { businessId }, _count: true }),
      prisma.task.groupBy({ by: ["status"], where: { businessId }, _count: true }),
      prisma.call.count({ where: { businessId, startedAt: { gte: monthStart } } }),
      prisma.agentRun.count({ where: { agent: { businessId }, startedAt: { gte: monthStart } } }),
      prisma.invoice.aggregate({ where: { businessId, status: "paid" }, _avg: { amount: true } }),
    ]);

    // Weighted pipeline value by stage probability × avg deal size
    const avgDeal = paidAll._avg?.amount ?? recurring._avg?.amount ?? 15000;
    const STAGE_P: Record<string, number> = { QUALIFIED: 0.1, CONTACTED: 0.15, REPLIED: 0.25, INTERESTED: 0.4, MEETING_SCHEDULED: 0.55, PROPOSAL_SENT: 0.7, NEGOTIATION: 0.85 };
    const weightedPipeline = pipeline.reduce((s, g) => s + g._count * (STAGE_P[g.stage] ?? 0.1) * avgDeal, 0);

    // Revenue trend (last 6 months, paid invoices)
    const trend = await Promise.all(last6.map(async (m) => {
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      const r = await prisma.invoice.aggregate({ where: { businessId, status: "paid", paidAt: { gte: m, lt: next } }, _sum: { amount: true } });
      return { month: m.toLocaleString("en", { month: "short" }), revenue: r._sum.amount ?? 0 };
    }));

    // Satisfaction proxy from call sentiment (last 90d)
    const sentiment = await prisma.call.groupBy({ by: ["sentiment"], where: { businessId, startedAt: { gte: new Date(now.getTime() - 90 * 864e5) } }, _count: true });
    const totalSent = sentiment.reduce((s, x) => s + x._count, 0);
    const positive = sentiment.find((s) => s.sentiment === "positive")?._count ?? 0;
    const satisfaction = totalSent ? Math.round((positive / totalSent) * 100) : null;

    // Conversion + real cash runway from actual expenses
    const contacted = await prisma.lead.count({ where: { businessId, stage: { in: ["CONTACTED", "REPLIED", "INTERESTED", "MEETING_SCHEDULED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"] } } });
    const won = await prisma.lead.count({ where: { businessId, stage: "WON" } });
    const expMTD = expensesMTD._sum.amount ?? 0;
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const trailingExp = await prisma.expense.aggregate({ where: { businessId, incurredAt: { gte: threeMonthsAgo } }, _sum: { amount: true } });
    const allExp = await prisma.expense.aggregate({ where: { businessId }, _sum: { amount: true } });
    const monthlyBurn = (trailingExp._sum.amount ?? 0) / 3;
    const profitMTD = (paidMTD._sum.amount ?? 0) - expMTD;
    const cash = (paidAll._sum.amount ?? 0) - (allExp._sum.amount ?? 0);
    const expensesTracked = (allExp._sum.amount ?? 0) > 0;
    const runwayMonths = expensesTracked && monthlyBurn ? +(cash / monthlyBurn).toFixed(1) : null;

    return {
      revenue: { mtd: paidMTD._sum.amount ?? 0, allTime: paidAll._sum.amount ?? 0, trend },
      profit: { mtd: profitMTD, expensesMTD: expMTD, monthlyBurn: Math.round(monthlyBurn), expensesTracked },
      cash: { position: cash, runwayMonths, recurringAvg: recurring._avg?.amount ?? 0 },
      receivables: { overdueAmount: overdue._sum.amount ?? 0, overdueCount: overdue._count, outstanding: draftSent._sum.amount ?? 0 },
      pipeline: { weightedValue: Math.round(weightedPipeline), byStage: pipeline, expectedRevenue: Math.round(weightedPipeline * 0.4) },
      sales: { wonThisMonth: wonMTD, conversionRate: contacted ? +((won / contacted) * 100).toFixed(1) : 0, avgDealSize: Math.round(avgDeal) },
      delivery: { projectHealth: projects, taskStatus: tasks },
      operations: { callsThisMonth: callsMonth, agentRunsThisMonth: agentRuns, aiUtilization: agentRuns },
      satisfaction,
    };
  });
}
