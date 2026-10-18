import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";
import { buildBriefing, CosPrefs, emailBriefing } from "../lib/chief";
import { validTimezone } from "../lib/booking";

const db: any = prisma;
const KEY = "chief_of_staff";
const defaults: CosPrefs = { email: false, hour: 7, tz: "Asia/Riyadh" };

export async function chiefRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));

  app.get("/businesses/:businessId/chief-of-staff/briefing", async (req) => {
    const { businessId } = req.params as any; await app.requireBusiness(req, businessId);
    return buildBriefing(businessId);
  });
  app.get("/me/chief-of-staff", async (req) => {
    const row = await db.userPref.findUnique({ where: { userId_key: { userId: req.auth!.userId, key: KEY } } });
    return { ...defaults, ...(row?.value ?? {}) };
  });
  app.put("/me/chief-of-staff", async (req) => {
    const b = z.object({ email: z.boolean(), hour: z.number().int().min(0).max(23), tz: z.string().refine(validTimezone, "Unknown time zone") }).strict().parse(req.body);
    const userId = req.auth!.userId;
    const row = await db.userPref.findUnique({ where: { userId_key: { userId, key: KEY } } });
    const value = { ...b, lastSent: row?.value?.lastSent };
    await db.userPref.upsert({ where: { userId_key: { userId, key: KEY } }, update: { value }, create: { userId, key: KEY, value } });
    return { ok: true };
  });
  app.post("/me/chief-of-staff/send-now", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    try { await emailBriefing(req.auth!.userId); return { ok: true }; }
    catch (e: any) {
      if (/No email provider/.test(e?.message)) return reply.code(503).send({ error: "Email delivery is not set up on this server (add SENDGRID_API_KEY and DEFAULT_FROM_EMAIL), so the briefing can't be emailed yet." });
      throw e;
    }
  });
}
