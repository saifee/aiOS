import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));
  app.get("/notifications", async (req) =>
    prisma.notification.findMany({ where: { userId: req.auth!.userId }, orderBy: { createdAt: "desc" }, take: 50 })
  );
  // Ownership is part of the WHERE clause: a user can only mark their own notifications (no IDOR/BOLA).
  app.post("/notifications/:id/read", async (req) => {
    const { id } = z.object({ id: z.string().min(1).max(64) }).parse(req.params);
    const r = await prisma.notification.updateMany({ where: { id, userId: req.auth!.userId }, data: { readAt: new Date() } });
    if (r.count === 0) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    return { ok: true };
  });
}
