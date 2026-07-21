import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";
import { runAgent } from "@leadhunter/agents";

/**
 * Executive Command Center.
 *  POST /command  — founder types/says a command; the CEO Assistant agent
 *                   interprets it and delegates across departments.
 *  GET  /morning-brief — the "open one dashboard every morning" summary.
 */
export async function commandRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));

  app.post("/businesses/:businessId/command", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    const { text } = z.object({ text: z.string().min(1) }).parse(req.body);
    const result = await runAgent({ businessId, role: "ceo_assistant", input: { command: text }, trigger: "command" });
    return { reply: result.text, actions: result.tools.map((t: any) => t.name), awaitingApproval: result.awaitingApproval, runId: result.runId };
  });

  app.get("/businesses/:businessId/morning-brief", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    const since = new Date(Date.now() - 24 * 3600_000);

    const [newLeads, qualified, callsDone, meetings, proposalsAccepted, approvals, atRisk, overdue, interested, wonThisMonth] = await Promise.all([
      prisma.lead.count({ where: { businessId, createdAt: { gte: since } } }),
      prisma.lead.count({ where: { businessId, stage: "QUALIFIED", updatedAt: { gte: since } } }),
      prisma.call.count({ where: { businessId, startedAt: { gte: since } } }),
      prisma.meeting.count({ where: { lead: { businessId }, startsAt: { gte: new Date() } } }),
      prisma.proposal.count({ where: { businessId, status: "accepted", createdAt: { gte: since } } }),
      prisma.approval.findMany({ where: { businessId, status: "pending" }, take: 10 }),
      prisma.project.count({ where: { businessId, health: "red" } }),
      prisma.invoice.aggregate({ where: { businessId, status: "overdue" }, _sum: { amount: true }, _count: true }),
      prisma.lead.count({ where: { businessId, stage: "INTERESTED" } }),
      prisma.lead.count({ where: { businessId, stage: "WON", updatedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }),
    ]);

    const headlines = [
      newLeads && `${newLeads} new leads found overnight`,
      qualified && `${qualified} newly qualified`,
      callsDone && `${callsDone} calls handled by the receptionist`,
      meetings && `${meetings} meetings on the calendar`,
      proposalsAccepted && `${proposalsAccepted} proposal(s) accepted`,
      approvals.length && `${approvals.length} item(s) need your approval`,
      atRisk && `${atRisk} project(s) at risk`,
      overdue._count && `${overdue._sum.amount ?? 0} SAR overdue across ${overdue._count} invoice(s)`,
    ].filter(Boolean);

    return {
      headlines, newLeads, qualified, callsDone, meetings, proposalsAccepted,
      pendingApprovals: approvals, projectsAtRisk: atRisk,
      overdue: { amount: overdue._sum.amount ?? 0, count: overdue._count },
      interested, wonThisMonth,
      growthOpportunities: await prisma.event.findMany({ where: { businessId, type: "opportunity.found", createdAt: { gte: since } }, take: 5, orderBy: { createdAt: "desc" } }),
    };
  });
}
