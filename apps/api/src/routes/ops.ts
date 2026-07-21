import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";

export async function opsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));
  const scope = async (req: any, businessId: string) => app.requireBusiness(req, businessId);

  app.get("/businesses/:businessId/projects", async (req) => { const { businessId } = req.params as any; await scope(req, businessId); return prisma.project.findMany({ where: { businessId }, include: { tasks: true }, orderBy: { createdAt: "desc" } }); });
  app.get("/businesses/:businessId/tasks", async (req) => { const { businessId } = req.params as any; await scope(req, businessId); return prisma.task.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 100 }); });
  app.get("/businesses/:businessId/proposals", async (req) => { const { businessId } = req.params as any; await scope(req, businessId); return prisma.proposal.findMany({ where: { businessId }, orderBy: { createdAt: "desc" } }); });
  app.get("/businesses/:businessId/invoices", async (req) => { const { businessId } = req.params as any; await scope(req, businessId); return prisma.invoice.findMany({ where: { businessId }, orderBy: { createdAt: "desc" } }); });
  app.get("/businesses/:businessId/calls", async (req) => { const { businessId } = req.params as any; await scope(req, businessId); return prisma.call.findMany({ where: { businessId }, include: { lead: { select: { companyName: true } } }, orderBy: { startedAt: "desc" }, take: 50 }); });
}
