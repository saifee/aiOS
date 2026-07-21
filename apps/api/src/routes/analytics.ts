import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";

export async function analyticsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));

  app.get("/businesses/:businessId/analytics/overview", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [leadsToday, emailsSent, waSent, opened, replies, interested, meetings, won, byStage, byCountry, byIndustry] =
      await Promise.all([
        prisma.lead.count({ where: { businessId, createdAt: { gte: today } } }),
        prisma.message.count({ where: { lead: { businessId }, channel: "EMAIL", direction: "OUTBOUND", status: { in: ["SENT", "DELIVERED", "OPENED", "REPLIED"] } } }),
        prisma.message.count({ where: { lead: { businessId }, channel: "WHATSAPP", direction: "OUTBOUND", status: { in: ["SENT", "DELIVERED", "OPENED", "REPLIED"] } } }),
        prisma.message.count({ where: { lead: { businessId }, direction: "OUTBOUND", openedAt: { not: null } } }),
        prisma.message.count({ where: { lead: { businessId }, direction: "INBOUND" } }),
        prisma.lead.count({ where: { businessId, stage: "INTERESTED" } }),
        prisma.meeting.count({ where: { lead: { businessId } } }),
        prisma.lead.count({ where: { businessId, stage: "WON" } }),
        prisma.lead.groupBy({ by: ["stage"], where: { businessId }, _count: true }),
        prisma.lead.groupBy({ by: ["country"], where: { businessId }, _count: true }),
        prisma.lead.groupBy({ by: ["industry"], where: { businessId }, _count: true, orderBy: { _count: { industry: "desc" } }, take: 10 }),
      ]);

    const outbound = emailsSent + waSent;
    return {
      leadsToday, emailsSent, whatsappSent: waSent,
      openRate: outbound ? +(opened / outbound * 100).toFixed(1) : 0,
      replyRate: outbound ? +(replies / outbound * 100).toFixed(1) : 0,
      positiveReplies: interested, meetingsBooked: meetings, dealsWon: won,
      conversionRate: outbound ? +(won / outbound * 100).toFixed(2) : 0,
      pipeline: byStage, heatmap: byCountry, industries: byIndustry,
      suggestions: await prisma.insight.findMany({ where: { businessId }, orderBy: { computedAt: "desc" }, take: 5 }),
    };
  });
}
