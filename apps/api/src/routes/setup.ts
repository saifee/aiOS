import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import argon2 from "argon2";
import { z } from "zod";
import { AGENT_REGISTRY } from "@leadhunter/agents";

/**
 * First-run setup wizard (unauthenticated, self-disabling).
 * Once any user exists the app is "configured" and these endpoints refuse to
 * run again — so it's safe to leave enabled. It performs the app-level setup
 * that used to require the Render Shell: connection check, admin + company
 * creation, demo business, and agent registration. Table creation + pgvector
 * happen on boot (the container runs `db push` first).
 */
export async function setupRoutes(app: FastifyInstance) {
  app.get("/setup/status", async () => {
    let database = false, users = 0;
    try { users = await prisma.user.count(); database = true; } catch { database = false; }
    return { configured: users > 0, database, agentCount: Object.keys(AGENT_REGISTRY).length };
  });

  app.post("/setup/init", async (req, reply) => {
    // Refuse if already configured
    let existing = 0;
    try { existing = await prisma.user.count(); }
    catch (e: any) { return reply.code(500).send({ error: "Database not reachable. Check DATABASE_URL and that tables were created (db push).", detail: String(e.message) }); }
    if (existing > 0) return reply.code(409).send({ error: "Already configured. Sign in instead." });

    const b = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8),
      company: z.string().min(1),
    }).parse(req.body);

    const slug = b.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + Date.now().toString(36);
    const tenant = await prisma.tenant.create({ data: { name: b.company, slug } });
    const user = await prisma.user.create({
      data: { email: b.email, name: b.name, passwordHash: await argon2.hash(b.password), memberships: { create: { tenantId: tenant.id, role: "OWNER" } } },
    });
    const business = await prisma.business.create({
      data: { tenantId: tenant.id, name: b.company, description: `${b.company} — configured via setup wizard`, languages: ["en", "ar"], targetCountries: ["SA"] },
    });
    // Register every department agent for this business
    for (const [role, def] of Object.entries(AGENT_REGISTRY))
      await prisma.agent.upsert({ where: { businessId_role: { businessId: business.id, role } }, update: {}, create: { businessId: business.id, role, displayName: def.displayName } });

    const token = app.jwt.sign({ userId: user.id, tenantId: tenant.id, role: "OWNER" }, { expiresIn: "7d" });
    return reply.code(201).send({ token, businessId: business.id, agents: Object.keys(AGENT_REGISTRY).length });
  });
}
