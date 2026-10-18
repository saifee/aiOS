import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import argon2 from "../lib/password";
import { z } from "zod";
import { AGENT_REGISTRY } from "@leadhunter/agents";
import { timingSafeEqual } from "crypto";
import { isProd } from "../lib/security";
import { guardCaptcha } from "../lib/captcha";
import { weakPassword } from "../lib/passwords";

const tokenOk = (given: unknown) => {
  const want = process.env.SETUP_TOKEN;
  if (!want) return true; // optional hardening: set SETUP_TOKEN to require it for the first-run wizard
  if (typeof given !== "string") return false;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
};
const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

/**
 * First-run setup wizard (unauthenticated, self-disabling).
 * Once any user exists the app is "configured" and these endpoints refuse to
 * run again — so it's safe to leave enabled. It performs the app-level setup
 * that used to require the Render Shell: connection check, admin + company
 * creation, demo business, and agent registration. Table creation
 * happens on boot (AUTO_MIGRATE / `db push`).
 */
export async function setupRoutes(app: FastifyInstance) {
  app.get("/setup/status", strict, async () => {
    let database = false, users = 0, error: string | undefined;
    try { users = await prisma.user.count(); database = true; }
    catch (e: any) {
      // Show WHY (wrong password, unknown host, missing tables, engine not found...) without leaking credentials.
      error = String(e?.message ?? e).replace(/[a-z+]+:\/\/[^\s"']+/gi, "<url>").split("\n").map((l) => l.trim()).filter(Boolean).slice(-3).join(" ").slice(0, 300);
      app.log.error({ err: e }, "setup/status: database check failed");
    }
    // Diagnostic detail is only shown outside production (or when SETUP_DEBUG=true); it is always logged server-side.
    const showDetail = !isProd() || process.env.SETUP_DEBUG === "true";
    return { configured: users > 0, database, error: showDetail ? error : (error ? "Database check failed — see server logs (or set SETUP_DEBUG=true temporarily)." : undefined), setupTokenRequired: !!process.env.SETUP_TOKEN && users === 0, agentCount: Object.keys(AGENT_REGISTRY).length };
  });

  app.post("/setup/init", strict, async (req, reply) => {
    if (!tokenOk((req.headers["x-setup-token"] ?? (req.body as any)?.setupToken))) return reply.code(403).send({ error: "A valid setup token is required (SETUP_TOKEN)." });
    // Refuse if already configured
    let existing = 0;
    try { existing = await prisma.user.count(); }
    catch (e: any) { app.log.error({ err: e }, "setup/init: database not reachable"); return reply.code(500).send({ error: "Database not reachable. Check DATABASE_URL and that tables were created (db push)." }); }
    if (existing > 0) return reply.code(409).send({ error: "Already configured. Sign in instead." });

    const b = z.object({
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().toLowerCase().email().max(254),
      password: z.string().min(10, "Password must be at least 10 characters").max(200),
      company: z.string().trim().min(1).max(120),
      setupToken: z.string().optional(),
      captcha: z.string().max(4096).optional(),
    }).parse(req.body);
    if (!(await guardCaptcha(req, reply, b.captcha))) return;
    const weak = weakPassword(b.password, b.email, b.name);
    if (weak) return reply.code(400).send({ error: weak });

    const slug = b.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + Date.now().toString(36);
    const tenant = await prisma.tenant.create({ data: { name: b.company, slug, plan: "ENTERPRISE" } });
    const user = await prisma.user.create({
      data: { email: b.email, name: b.name, passwordHash: await argon2.hash(b.password), memberships: { create: { tenantId: tenant.id, role: "OWNER" } } },
    });
    const business = await prisma.business.create({
      data: { tenantId: tenant.id, name: b.company, description: `${b.company} — configured via setup wizard`, languages: ["en", "ar"], targetCountries: ["SA"] },
    });
    // Register every department agent for this business
    for (const [role, def] of Object.entries(AGENT_REGISTRY))
      await prisma.agent.upsert({ where: { businessId_role: { businessId: business.id, role } }, update: {}, create: { businessId: business.id, role, displayName: def.displayName } });

    const token = app.jwt.sign({ userId: user.id, tenantId: tenant.id, role: "OWNER" }, {});
    return reply.code(201).send({ token, businessId: business.id, agents: Object.keys(AGENT_REGISTRY).length });
  });
}
