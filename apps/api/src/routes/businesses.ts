import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";

const businessSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  services: z.array(z.string()).default([]),
  industriesServed: z.array(z.string()).default([]),
  targetCountries: z.array(z.string()).default([]),
  targetCities: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  negativeKeywords: z.array(z.string()).default([]),
  idealCompanySizeMin: z.number().int().optional(),
  idealCompanySizeMax: z.number().int().optional(),
  decisionMakerTitles: z.array(z.string()).default([]),
  maxOutreachPerDay: z.number().int().min(1).max(500).default(50),
  workingHoursStart: z.string().default("09:00"),
  workingHoursEnd: z.string().default("18:00"),
  timezone: z.string().default("Asia/Riyadh"),
  languages: z.array(z.string()).default(["en"]),
  tone: z.string().default("professional"),
  calendarLink: z.string().url().optional(),
  minLeadScore: z.number().int().min(0).max(100).default(60),
  notificationPrefs: z.any().optional(),
});

export async function businessRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));

  app.get("/", async (req) =>
    prisma.business.findMany({ where: { tenantId: req.auth!.tenantId }, orderBy: { createdAt: "desc" } })
  );

  app.post("/", async (req, reply) => {
    const data = businessSchema.parse(req.body);
    const biz = await prisma.business.create({ data: { ...data, tenantId: req.auth!.tenantId } });
    await prisma.auditLog.create({
      data: { tenantId: req.auth!.tenantId, actor: `user:${req.auth!.userId}`, action: "business.create", target: biz.id },
    });
    return reply.code(201).send(biz);
  });

  app.get("/:id", async (req) => {
    const { id } = req.params as { id: string };
    await app.requireBusiness(req, id);
    return prisma.business.findUnique({ where: { id }, include: { campaigns: true, templates: true, integrations: { select: { provider: true, status: true } } } });
  });

  app.patch("/:id", async (req) => {
    const { id } = req.params as { id: string };
    await app.requireBusiness(req, id);
    const data = businessSchema.partial().parse(req.body);
    return prisma.business.update({ where: { id }, data });
  });
}
