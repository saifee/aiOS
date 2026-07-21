import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import argon2 from "argon2";
import { z } from "zod";

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (req, reply) => {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(1),
      tenantName: z.string().min(1),
    }).parse(req.body);

    const slug = body.tenantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + Date.now().toString(36);
    const tenant = await prisma.tenant.create({ data: { name: body.tenantName, slug } });
    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash: await argon2.hash(body.password),
        memberships: { create: { tenantId: tenant.id, role: "OWNER" } },
      },
    });
    const token = app.jwt.sign({ userId: user.id, tenantId: tenant.id, role: "OWNER" }, { expiresIn: "7d" });
    return reply.code(201).send({ token, user: { id: user.id, email: user.email, name: user.name } });
  });

  app.post("/login", async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email }, include: { memberships: true } });
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, body.password)))
      return reply.code(401).send({ error: "Invalid credentials" });
    const m = user.memberships[0];
    const token = app.jwt.sign({ userId: user.id, tenantId: m.tenantId, role: m.role }, { expiresIn: "7d" });
    return { token, user: { id: user.id, email: user.email, name: user.name } };
  });
}
