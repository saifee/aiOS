import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";
import { runAgent, DEPARTMENTS, deliverApprovedPR } from "@leadhunter/agents";

export async function agentRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));

  // The full org chart (from the registry) + live state per business
  app.get("/businesses/:businessId/agents", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    const live = await prisma.agent.findMany({ where: { businessId }, include: { runs: { orderBy: { startedAt: "desc" }, take: 1 } } });
    return DEPARTMENTS.map((d) => {
      const a = live.find((x) => x.role === d.role);
      return { role: d.role, displayName: d.displayName, department: d.department, tools: d.tools, status: a?.status ?? "idle", lastRun: a?.runs[0]?.startedAt ?? null };
    });
  });

  app.post("/businesses/:businessId/agents/:role/run", async (req) => {
    const { businessId, role } = req.params as any;
    await app.requireBusiness(req, businessId);
    const { input } = z.object({ input: z.record(z.any()) }).parse(req.body);
    return runAgent({ businessId, role, input, trigger: "manual" });
  });

  app.get("/businesses/:businessId/agent-runs", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    return prisma.agentRun.findMany({ where: { agent: { businessId } }, include: { agent: true }, orderBy: { startedAt: "desc" }, take: 50 });
  });

  // Human-in-the-loop approvals
  app.get("/businesses/:businessId/approvals", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    return prisma.approval.findMany({ where: { businessId, status: "pending" }, orderBy: { createdAt: "desc" } });
  });

  app.post("/approvals/:id/decide", async (req) => {
    const { id } = req.params as any;
    const { decision } = z.object({ decision: z.enum(["approved", "rejected"]) }).parse(req.body);
    const appr = await prisma.approval.findUnique({ where: { id } });
    if (!appr) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await app.requireBusiness(req, appr.businessId);
    const updated = await prisma.approval.update({ where: { id }, data: { status: decision, decidedBy: `user:${req.auth!.userId}`, decidedAt: new Date() } });
    // Execute the approved action
    if (decision === "approved" && appr.action === "open_pull_request") {
      const runId = (appr.payload as any)?.runId;
      if (runId) { const url = await deliverApprovedPR(runId).catch((e) => ({ error: String(e.message) })); return { ...updated, prUrl: url }; }
    }
    return updated;
  });
}
