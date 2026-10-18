import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import argon2 from "../lib/password";
import { z } from "zod";
import { captchaConfig, guardCaptcha } from "../lib/captcha";
import { lockedFor, recordFailure, recordSuccess } from "../lib/lockout";
import { weakPassword } from "../lib/passwords";

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10, "Password must be at least 10 characters").max(200);
// Verified against when the account doesn't exist, so response time doesn't reveal which emails are registered.
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");
const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

export async function authRoutes(app: FastifyInstance) {
  // Tells the login page which bot check to show (the site key is public by design; the secret never leaves the server).
  app.get("/captcha", async () => { const c = captchaConfig(); return c ? { provider: c.provider, siteKey: c.siteKey } : { provider: null }; });

  app.post("/register", strict, async (req, reply) => {
    const body = z.object({
      email, password, name: z.string().trim().min(1).max(120), tenantName: z.string().trim().min(1).max(120), captcha: z.string().max(4096).optional(),
    }).strict().parse(req.body); // .strict(): unknown fields (e.g. role/plan) are rejected — no mass assignment

    if (!(await guardCaptcha(req, reply, body.captcha))) return;
    const weak = weakPassword(body.password, body.email, body.name);
    if (weak) return reply.code(400).send({ error: weak });
    if (await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } }))
      return reply.code(409).send({ error: "An account with this email already exists." });

    const slug = body.tenantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + Date.now().toString(36);
    const passwordHash = await argon2.hash(body.password);
    try {
      // One nested write → tenant, user and membership are created atomically (no orphan tenants).
      const user = await prisma.user.create({
        data: { email: body.email, name: body.name, passwordHash, memberships: { create: { role: "OWNER", tenant: { create: { name: body.tenantName, slug } } } } },
        include: { memberships: true },
      });
      const token = app.jwt.sign({ userId: user.id, tenantId: user.memberships[0].tenantId, role: "OWNER" });
      return reply.code(201).send({ token, user: { id: user.id, email: user.email, name: user.name } });
    } catch (e: any) {
      if (e?.code === "P2002") return reply.code(409).send({ error: "An account with this email already exists." });
      throw e;
    }
  });

  app.post("/login", strict, async (req, reply) => {
    const body = z.object({ email, password: z.string().min(1).max(200), captcha: z.string().max(4096).optional() }).parse(req.body);
    const wait = lockedFor(body.email, req.ip);
    if (wait > 0) return reply.code(429).header("Retry-After", String(wait)).send({ error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` });
    if (!(await guardCaptcha(req, reply, body.captcha))) return;
    const user = await prisma.user.findUnique({ where: { email: body.email }, include: { memberships: true } });
    const ok = await argon2.verify(user?.passwordHash ?? DUMMY_HASH, body.password);
    const m = user?.memberships[0];
    if (!user || !user.passwordHash || !ok || !m) { recordFailure(body.email, req.ip); return reply.code(401).send({ error: "Invalid credentials" }); }
    recordSuccess(body.email, req.ip);
    const token = app.jwt.sign({ userId: user.id, tenantId: m.tenantId, role: m.role });
    return { token, user: { id: user.id, email: user.email, name: user.name } };
  });
}
