import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";
import { queues } from "../lib/queues";

export async function campaignRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));

  app.get("/businesses/:businessId/campaigns", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    return prisma.campaign.findMany({ where: { businessId }, include: { _count: { select: { leads: true } } } });
  });

  app.post("/businesses/:businessId/campaigns", async (req, reply) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    const data = z.object({
      name: z.string().min(1),
      channels: z.array(z.enum(["EMAIL", "WHATSAPP", "LINKEDIN", "SMS", "CALL"])).min(1),
      sources: z.array(z.string()).min(1),
      followUpDays: z.array(z.number().int().positive()).default([3, 7, 14]),
      maxFollowUps: z.number().int().min(0).max(10).default(3),
    }).parse(req.body);
    const campaign = await prisma.campaign.create({ data: { ...data, businessId } });
    // Kick off the discovery loop immediately, then it repeats via cron in workers
    await queues.discovery.add("discover", { campaignId: campaign.id }, { removeOnComplete: true });
    return reply.code(201).send(campaign);
  });

  app.patch("/campaigns/:id/status", async (req) => {
    const { id } = req.params as any;
    const { status } = z.object({ status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]) }).parse(req.body);
    const campaign = await prisma.campaign.findUnique({ where: { id }, select: { businessId: true } });
    if (!campaign) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await app.requireBusiness(req, campaign.businessId);
    return prisma.campaign.update({ where: { id }, data: { status } });
  });
}
