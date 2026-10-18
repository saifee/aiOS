import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";
import { encrypt, decrypt } from "../lib/crypto";

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
    app.requireRole(req, "OWNER", "ADMIN"); // credentials are admin-only
    await app.requireBusiness(req, businessId);
    if (!(PROVIDERS as readonly string[]).includes(provider)) throw Object.assign(new Error("Unknown integration provider"), { statusCode: 400 });
    if (provider === "whatsapp_cloud") {
      const b: any = req.body;
      if (!b?.config?.phoneNumberId || !/^\d{5,25}$/.test(String(b.config.phoneNumberId))) throw Object.assign(new Error("Phone number ID must be the numeric ID from Meta (WhatsApp → API setup)."), { statusCode: 400 });
    }
    const { credentials, config } = z.object({ credentials: z.record(z.string().max(2000)).refine((c) => Object.keys(c).length <= 20).optional(), config: z.record(z.any()).optional() }).strict().parse(req.body);
    if (config && JSON.stringify(config).length > 20_000) throw Object.assign(new Error("config too large"), { statusCode: 413 });
    await prisma.integration.upsert({
      where: { businessId_provider: { businessId, provider } },
      update: { status: "connected", ...(credentials && { credentials: { enc: encrypt(JSON.stringify(credentials)) } }), config },
      create: { businessId, provider, status: "connected", credentials: credentials ? { enc: encrypt(JSON.stringify(credentials)) } : undefined, config },
      select: { id: true },
    });
    // Never echo stored (encrypted) credentials back to the client.
    return { provider, status: "connected" };
  });

  // Check a business's WhatsApp Cloud API connection against Meta (read-only call).
  app.post("/businesses/:businessId/integrations/whatsapp_cloud/test", async (req, reply) => {
    const { businessId } = req.params as any;
    app.requireRole(req, "OWNER", "ADMIN");
    await app.requireBusiness(req, businessId);
    const row: any = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "whatsapp_cloud" } } });
    let token = ""; try { token = JSON.parse(decrypt(row?.credentials?.enc ?? "")).accessToken ?? ""; } catch { /* unreadable */ }
    const id = row?.config?.phoneNumberId;
    if (!token || !id) return reply.code(400).send({ error: "Save your Phone number ID and access token first." });
    const res = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(String(id))}?fields=display_phone_number,verified_name,quality_rating`, { headers: { Authorization: `Bearer ${token}` } });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok) return reply.code(400).send({ error: `Meta rejected the credentials: ${j?.error?.message ?? res.status}` });
    return { ok: true, number: j.display_phone_number, name: j.verified_name, quality: j.quality_rating };
  });
}
