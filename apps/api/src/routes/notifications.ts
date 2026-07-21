import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));
  app.get("/notifications", async (req) =>
    prisma.notification.findMany({ where: { userId: req.auth!.userId }, orderBy: { createdAt: "desc" }, take: 50 })
  );
  app.post("/notifications/:id/read", async (req) =>
    prisma.notification.update({ where: { id: (req.params as any).id }, data: { readAt: new Date() } })
  );
}
