import fp from "fastify-plugin";
import { FastifyRequest } from "fastify";
import { prisma } from "@leadhunter/db";

declare module "fastify" {
  interface FastifyRequest {
    auth?: { userId: string; tenantId: string; role: string };
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>;
    requireBusiness: (req: FastifyRequest, businessId: string) => Promise<void>;
  }
}

/**
 * Multi-tenant guard: every authenticated request carries { userId, tenantId, role }.
 * requireBusiness verifies the business belongs to the caller's tenant — the core
 * isolation check applied to every business-scoped route.
 */
export const tenantPlugin = fp(async (app) => {
  app.decorate("authenticate", async (req: FastifyRequest) => {
    const payload = await (req as any).jwtVerify();
    req.auth = payload as any;
  });
  app.decorate("requireBusiness", async (req: FastifyRequest, businessId: string) => {
    const biz = await prisma.business.findFirst({
      where: { id: businessId, tenantId: req.auth!.tenantId },
      select: { id: true },
    });
    if (!biz) throw Object.assign(new Error("Business not found in tenant"), { statusCode: 404 });
  });
});
