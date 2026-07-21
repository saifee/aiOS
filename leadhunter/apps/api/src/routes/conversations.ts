import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";
import { queues } from "../lib/queues";

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));

  app.get("/businesses/:businessId/conversations", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    return prisma.conversation.findMany({
      where: { lead: { businessId } },
      include: { lead: { select: { id: true, companyName: true, stage: true, leadScore: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
  });

  // Human takes over from the AI agent
  app.post("/conversations/:id/handoff", async (req) => {
    const { id } = req.params as any;
    const conv = await prisma.conversation.findUnique({ where: { id }, include: { lead: { select: { businessId: true } } } });
    if (!conv) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await app.requireBusiness(req, conv.lead.businessId);
    return prisma.conversation.update({ where: { id }, data: { state: "HUMAN_HANDOFF", handoffReason: "manual" } });
  });

  // Human sends a reply through the platform (logged + delivered via channel worker)
  app.post("/conversations/:id/reply", async (req) => {
    const { id } = req.params as any;
    const { body } = z.object({ body: z.string().min(1) }).parse(req.body);
    const conv = await prisma.conversation.findUnique({ where: { id }, include: { lead: true } });
    if (!conv) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await app.requireBusiness(req, conv.lead.businessId);
    const msg = await prisma.message.create({
      data: { leadId: conv.leadId, channel: conv.channel, direction: "OUTBOUND", body, status: "QUEUED", meta: { human: true } },
    });
    await queues.outreach.add("send-existing", { messageId: msg.id });
    return msg;
  });
}
