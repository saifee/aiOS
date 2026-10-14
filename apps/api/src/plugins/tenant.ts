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
    requireRole: (req: FastifyRequest, ...roles: string[]) => void;
  }
}

const unauthorized = () => Object.assign(new Error("Unauthorized"), { statusCode: 401 });
// Short-lived membership cache so a removed user / changed role takes effect within a minute.
const memberCache = new Map<string, { role: string | null; exp: number }>();
const TTL = 60_000;
export const clearMembershipCache = () => memberCache.clear();

/**
 * Multi-tenant guard: every authenticated request carries { userId, tenantId, role }.
 * The token is re-checked against the live Membership row (role comes from the DB, never the token),
 * and requireBusiness verifies the business belongs to the caller's tenant — the core
 * isolation check applied to every business-scoped route.
 */
export const tenantPlugin = fp(async (app) => {
  app.decorate("authenticate", async (req: FastifyRequest) => {
    let payload: any;
    try { payload = await (req as any).jwtVerify({ algorithms: ["HS256"] }); } catch { throw unauthorized(); }
    if (!payload?.userId || !payload?.tenantId) throw unauthorized();
    const k = `${payload.userId}:${payload.tenantId}`;
    let c = memberCache.get(k);
    if (!c || c.exp < Date.now()) {
      const m = await prisma.membership.findFirst({ where: { userId: payload.userId, tenantId: payload.tenantId }, select: { role: true } });
      c = { role: m?.role ?? null, exp: Date.now() + TTL };
      memberCache.set(k, c);
      if (memberCache.size > 5000) memberCache.clear();
    }
    if (!c.role) throw unauthorized();
    req.auth = { userId: payload.userId, tenantId: payload.tenantId, role: c.role };
    // Read-only role: may only change their own preferences / notification state.
    if (c.role === "VIEWER" && !["GET", "HEAD", "OPTIONS"].includes(req.method) && !/^\/v1\/(me\/prefs|notifications)\b/.test(req.url))
      throw Object.assign(new Error("Forbidden: read-only role"), { statusCode: 403 });
  });
  app.decorate("requireBusiness", async (req: FastifyRequest, businessId: string) => {
    const biz = await prisma.business.findFirst({
      where: { id: businessId, tenantId: req.auth!.tenantId },
      select: { id: true },
    });
    if (!biz) throw Object.assign(new Error("Business not found in tenant"), { statusCode: 404 });
  });
  app.decorate("requireRole", (req: FastifyRequest, ...roles: string[]) => {
    if (!roles.includes(req.auth!.role)) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  });
});
