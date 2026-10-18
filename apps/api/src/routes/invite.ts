import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import argon2 from "../lib/password";
import { z } from "zod";
import { guardCaptcha } from "../lib/captcha";
import { hashToken, validTokenShape } from "../lib/invites";
import { weakPassword } from "../lib/passwords";

const db: any = prisma;
const strict = { config: { rateLimit: { max: 15, timeWindow: "1 minute" } } };
const gone = { error: "This invitation link is invalid, already used, or expired." };

async function load(token: string) {
  if (!validTokenShape(token)) return null;
  const inv = await db.invite.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!inv || inv.acceptedAt || new Date(inv.expiresAt) < new Date()) return null;
  const tenant = inv.tenantId ? await db.tenant.findUnique({ where: { id: inv.tenantId }, select: { id: true, name: true } }) : null;
  if (inv.tenantId && !tenant) return null;
  const exists = !!(await db.user.findUnique({ where: { email: inv.email }, select: { id: true } }));
  return { inv, workspace: tenant?.name ?? inv.workspace ?? "your workspace", exists };
}

/** Accepting an invitation emailed by a platform admin. The link is the credential, so it is single-use, hashed at rest, and expires. */
export async function inviteRoutes(app: FastifyInstance) {
  app.get("/public/invite/:token", strict, async (req, reply) => {
    const r = await load((req.params as any).token);
    if (!r) return reply.code(404).send(gone);
    return { email: r.inv.email, workspace: r.workspace, role: r.inv.tenantId ? r.inv.role : "OWNER", accountExists: r.exists, expiresAt: r.inv.expiresAt };
  });

  app.post("/auth/invite/accept", strict, async (req, reply) => {
    const b = z.object({ token: z.string().max(80), name: z.string().trim().min(1).max(120).optional(), password: z.string().min(10, "Password must be at least 10 characters").max(200).optional(), captcha: z.string().max(4096).optional() }).strict().parse(req.body);
    if (!(await guardCaptcha(req, reply, b.captcha))) return;
    const r = await load(b.token);
    if (!r) return reply.code(404).send(gone);
    const { inv } = r;
    let userId = ""; let user: any = await db.user.findUnique({ where: { email: inv.email }, select: { id: true, email: true, name: true } });

    if (user) {
      // Existing account: the person must prove they own it by being signed in as that user.
      try { await app.authenticate(req); } catch { return reply.code(401).send({ error: "This email already has an account. Sign in with it, then open the invitation link again." }); }
      if (req.auth!.userId !== user.id) return reply.code(403).send({ error: `Sign in as ${inv.email} to accept this invitation.` });
      userId = user.id;
    } else {
      if (!b.name || !b.password) return reply.code(400).send({ error: "Enter your name and choose a password." });
      const weak = weakPassword(b.password, inv.email, b.name);
      if (weak) return reply.code(400).send({ error: weak });
    }

    // Claim first, atomically: a double click or a replay cannot use the link twice.
    const claim = await db.invite.updateMany({ where: { id: inv.id, acceptedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
    if (claim.count !== 1) return reply.code(404).send(gone);

    try {
      let tenantId: string; let role: string;
      if (inv.tenantId) { tenantId = inv.tenantId; role = inv.role; }
      else { role = "OWNER"; tenantId = ""; }
      if (!user) {
        const passwordHash = await argon2.hash(b.password!);
        const name = b.name!;
        const created = await db.user.create({
          data: { email: inv.email, name, passwordHash, memberships: inv.tenantId
            ? { create: { role, tenantId } }
            : { create: { role: "OWNER", tenant: { create: { name: inv.workspace || `${name}'s workspace`, slug: slug(inv.workspace || name) } } } } },
          include: { memberships: true },
        });
        userId = created.id; user = created; tenantId = created.memberships[0].tenantId; role = created.memberships[0].role;
      } else if (inv.tenantId) {
        await db.membership.upsert({ where: { tenantId_userId: { tenantId, userId } }, update: {}, create: { tenantId, userId, role } });
      } else {
        const t = await db.tenant.create({ data: { name: inv.workspace || `${user.name || "New"} workspace`, slug: slug(inv.workspace || user.name || "ws") } });
        await db.membership.create({ data: { tenantId: t.id, userId, role: "OWNER" } });
        tenantId = t.id;
      }
      const token = app.jwt.sign({ userId, tenantId, role });
      return reply.code(201).send({ token, user: { id: userId, email: inv.email, name: user.name } });
    } catch (e) {
      await db.invite.updateMany({ where: { id: inv.id }, data: { acceptedAt: null } }).catch(() => {}); // let them retry
      throw e;
    }
  });
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + Date.now().toString(36);
