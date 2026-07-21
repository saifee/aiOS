import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";
import { DEPARTMENTS, runAgent } from "@leadhunter/agents";

const AI = process.env.AI_SERVICE_URL || "http://localhost:8000";

/**
 * SOP Engine. Capture a process (taught via description, or observed from the
 * audit log), store it as a structured SOP, and optionally activate it as an
 * automation an AI agent runs on a trigger.
 */
export async function sopRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));

  app.get("/businesses/:businessId/sops", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    return prisma.sop.findMany({ where: { businessId }, include: { runs: { orderBy: { startedAt: "desc" }, take: 3 } }, orderBy: { updatedAt: "desc" } });
  });

  app.post("/businesses/:businessId/sops/generate", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    const { description, fromActivity } = z.object({ description: z.string().optional(), fromActivity: z.boolean().optional() }).parse(req.body);
    const business = await prisma.business.findUnique({ where: { id: businessId } });

    let activity_log: any = null;
    if (fromActivity) {
      const logs = await prisma.auditLog.findMany({ where: { tenantId: req.auth!.tenantId }, orderBy: { createdAt: "desc" }, take: 40 });
      activity_log = logs.map((l) => ({ actor: l.actor, action: l.action, detail: l.detail, at: l.createdAt }));
    }

    const res = await fetch(`${AI}/sop/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business: { name: business?.name, services: business?.services, description: business?.description }, description, activity_log, roles: DEPARTMENTS.map((d) => d.role) }),
    });
    if (!res.ok) throw new Error(`SOP generation failed: ${res.status}`);
    const gen: any = await res.json();
    return prisma.sop.create({
      data: { businessId, title: gen.title, department: gen.department, description: gen.description, trigger: gen.trigger ?? "manual", steps: gen.steps ?? [], automation: gen.automation ?? undefined, source: gen.source ?? (description ? "taught" : "observed") },
    });
  });

  app.post("/businesses/:businessId/sops", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    const body = z.object({ title: z.string(), department: z.string().optional(), description: z.string().optional(), trigger: z.string().default("manual"), steps: z.array(z.any()).default([]), automation: z.any().optional() }).parse(req.body);
    return prisma.sop.create({ data: { businessId, ...body, source: "manual" } });
  });

  app.patch("/sops/:id", async (req) => {
    const { id } = req.params as any;
    const sop = await prisma.sop.findUnique({ where: { id } });
    if (!sop) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await app.requireBusiness(req, sop.businessId);
    const body = z.object({ title: z.string().optional(), steps: z.array(z.any()).optional(), trigger: z.string().optional(), status: z.enum(["draft", "active", "archived"]).optional(), automation: z.any().optional() }).parse(req.body);
    return prisma.sop.update({ where: { id }, data: body });
  });

  app.post("/sops/:id/activate", async (req) => {
    const { id } = req.params as any;
    const sop = await prisma.sop.findUnique({ where: { id } });
    if (!sop) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await app.requireBusiness(req, sop.businessId);
    return prisma.sop.update({ where: { id }, data: { status: "active" } });
  });

  // Run an SOP's automation now (through the agent kernel).
  app.post("/sops/:id/run", async (req) => {
    const { id } = req.params as any;
    const sop = await prisma.sop.findUnique({ where: { id } });
    if (!sop) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await app.requireBusiness(req, sop.businessId);
    const auto = sop.automation as any;
    if (!auto?.role) return { ran: false, note: "This SOP is a human checklist — no automation attached." };
    const run = await prisma.sopRun.create({ data: { sopId: id } });
    const result = await runAgent({ businessId: sop.businessId, role: auto.role, input: auto.input ?? { task: sop.title }, trigger: "manual" });
    await prisma.sopRun.update({ where: { id: run.id }, data: { status: "done", result: { text: result.text } as any, endedAt: new Date() } });
    return { ran: true, result: result.text, awaitingApproval: result.awaitingApproval };
  });
}
