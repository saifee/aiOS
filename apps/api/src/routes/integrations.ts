import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";
import { encrypt } from "../lib/crypto";

const PROVIDERS = [
  "sendgrid", "ses", "whatsapp_cloud", "google_calendar", "ms365", "zoom", "calcom",
  "slack", "telegram", "hunter", "apollo", "clearbit", "google_places", "google_cse", "serpapi", "stripe",
] as const;

export async function integrationRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));

  app.get("/businesses/:businessId/integrations", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    const rows = await prisma.integration.findMany({ where: { businessId }, select: { provider: true, status: true, config: true } });
    return { available: PROVIDERS, connected: rows };
  });

  app.put("/businesses/:businessId/integrations/:provider", async (req) => {
    const { businessId, provider } = req.params as any;
    await app.requireBusiness(req, businessId);
    const { credentials, config } = z.object({ credentials: z.record(z.string()).optional(), config: z.any().optional() }).parse(req.body);
    return prisma.integration.upsert({
      where: { businessId_provider: { businessId, provider } },
      update: { status: "connected", ...(credentials && { credentials: { enc: encrypt(JSON.stringify(credentials)) } }), config },
      create: { businessId, provider, status: "connected", credentials: credentials ? { enc: encrypt(JSON.stringify(credentials)) } : undefined, config },
    });
  });
}
