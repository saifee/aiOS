import { FastifyInstance } from "fastify";
import { prisma, Stage } from "@leadhunter/db";
import { z } from "zod";
import { queues } from "../lib/queues";

export async function leadRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));

  app.get("/businesses/:businessId/leads", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    const q = z.object({
      stage: z.nativeEnum(Stage).optional(),
      minScore: z.coerce.number().optional(),
      search: z.string().optional(),
      cursor: z.string().optional(),
      take: z.coerce.number().min(1).max(100).default(50),
    }).parse(req.query);
    return prisma.lead.findMany({
      where: {
        businessId,
        ...(q.stage && { stage: q.stage }),
        ...(q.minScore && { leadScore: { gte: q.minScore } }),
        ...(q.search && { companyName: { contains: q.search, mode: "insensitive" } }),
      },
      include: { contacts: true, _count: { select: { messages: true } } },
      orderBy: { leadScore: "desc" },
      take: q.take,
      ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
    });
  });

  app.get("/leads/:id", async (req) => {
    const { id } = req.params as any;
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: { contacts: true, activities: { orderBy: { createdAt: "desc" }, take: 50 }, messages: { orderBy: { createdAt: "asc" } }, meetings: true, conversations: true },
    });
    if (!lead) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await app.requireBusiness(req, lead.businessId);
    return lead;
  });

  app.patch("/leads/:id/stage", async (req) => {
    const { id } = req.params as any;
    const { stage } = z.object({ stage: z.nativeEnum(Stage) }).parse(req.body);
    const lead = await prisma.lead.findUnique({ where: { id }, select: { businessId: true } });
    if (!lead) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await app.requireBusiness(req, lead.businessId);
    const updated = await prisma.lead.update({ where: { id }, data: { stage } });
    await prisma.activity.create({ data: { leadId: id, type: "stage_change", actor: `user:${req.auth!.userId}`, detail: { stage } } });
    return updated;
  });

  // Manual re-enrichment / re-scoring / immediate outreach triggers
  app.post("/leads/:id/enrich", async (req) => { await guard(app, req); await queues.enrichment.add("enrich", { leadId: (req.params as any).id }); return { queued: true }; });
  app.post("/leads/:id/qualify", async (req) => { await guard(app, req); await queues.qualification.add("qualify", { leadId: (req.params as any).id }); return { queued: true }; });
  app.post("/leads/:id/outreach", async (req) => { await guard(app, req); await queues.outreach.add("outreach", { leadId: (req.params as any).id, manual: true }); return { queued: true }; });

  app.post("/leads/:id/opt-out", async (req) => {
    const { id } = req.params as any;
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await app.requireBusiness(req, lead.businessId);
    await prisma.lead.update({ where: { id }, data: { optedOut: true, stage: "ARCHIVED" } });
    for (const email of lead.emails)
      await prisma.suppression.upsert({ where: { scope_value: { scope: "email", value: email } }, update: {}, create: { scope: "email", value: email, reason: "opt_out" } });
    return { ok: true };
  });
}

async function guard(app: FastifyInstance, req: any) {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id }, select: { businessId: true } });
  if (!lead) throw Object.assign(new Error("Not found"), { statusCode: 404 });
  await app.requireBusiness(req, lead.businessId);
}
