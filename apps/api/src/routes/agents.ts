import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";
import { runAgent, DEPARTMENTS, deliverApprovedPR, EMPLOYEES, EMPLOYEE_AGENT } from "@leadhunter/agents";

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
    const { input } = z.object({ input: z.record(z.string(), z.any()) }).parse(req.body);
    return runAgent({ businessId, role, input, trigger: "manual", userId: req.auth!.userId });
  });

  app.get("/businesses/:businessId/agent-runs", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    const direct: any[] = await prisma.agentRun.findMany({ where: { agent: { businessId } }, include: { agent: true }, orderBy: { startedAt: "desc" }, take: 50 });
    // One team: scheduled routines show up as activity of the agent they belong to.
    let scheduled: any[] = [];
    try {
      const db: any = prisma;
      const [rows, agents] = await Promise.all([
        db.employeeRun.findMany({ where: { businessId, status: { in: ["ok", "failed", "blocked"] } }, orderBy: { startedAt: "desc" }, take: 30 }),
        prisma.agent.findMany({ where: { businessId } }),
      ]);
      scheduled = rows.map((r: any) => {
        const role = EMPLOYEE_AGENT[r.employee] ?? r.employee;
        const a: any = agents.find((x: any) => x.role === role);
        const emp = EMPLOYEES.find((e) => e.id === r.employee);
        return { id: "sched-" + r.id, trigger: r.trigger === "manual" ? "scheduled routine (run by you)" : "scheduled routine", startedAt: r.startedAt, status: r.status === "ok" ? "done" : r.status, output: { text: r.title ? `${r.title}${r.state === "new" && r.status === "ok" ? " (ready to review)" : ""}` : r.error ?? "" }, agent: { role, displayName: a?.displayName ?? emp?.name ?? role } };
      });
    } catch { /* optional */ }
    return [...direct, ...scheduled].sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt)).slice(0, 50);
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
