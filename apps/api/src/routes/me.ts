import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";
import { PLANS, PlanKey, encrypt, encryptionConfigured, assertPublicUrl, allowPrivateAiUrls } from "@leadhunter/integrations";
import { securityWarnings } from "../lib/security";
import { isSuperAdmin } from "../lib/superadmin";
import { PROVIDERS, testKey, invalidateKeys, invalidatePlan, MODEL_RE } from "@leadhunter/agents";

const encryptionReady = encryptionConfigured;
const hasPlatformAi = () => !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);

const publicKey = (k: any) => ({
  id: k.id, provider: k.provider, label: k.label, model: k.model, baseUrl: k.baseUrl, hint: k.keyHint, priority: k.priority,
  enabled: k.enabled, shared: k.shared, lastOkAt: k.lastOkAt, lastError: k.lastError, createdAt: k.createdAt,
});

/** Profile, plan, bring-your-own AI keys, dashboard layouts, goals & decisions. */
export async function meRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));

  // ── Who am I / what can I do ───────────────────────────────
  app.get("/me", async (req) => {
    const { userId, tenantId } = req.auth!;
    // Optional tables are read defensively so an un-upgraded database never blanks the whole profile.
    const soft = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
    const [user, tenant, sub, keys, superadmin] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } }),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, plan: true } }),
      soft(prisma.subscription.findUnique({ where: { tenantId } }), null),
      soft(prisma.aiKey.count({ where: { tenantId, enabled: true } }), 0),
      soft(isSuperAdmin(userId), false),
    ]);
    const plan = ((sub?.plan ?? tenant?.plan) ?? "FREE") as PlanKey;
    const p = PLANS[plan];
    return {
      user, tenant: tenant && { id: tenant.id, name: tenant.name },
      plan, planName: p.name, byokOnly: !!p.byokOnly, limits: p.limits,
      superadmin, aiKeys: keys, aiReady: keys > 0 || (!p.byokOnly && hasPlatformAi()), role: req.auth!.role,
      // Configuration problems are only shown to owners/admins (never secret values).
      securityWarnings: ["OWNER", "ADMIN"].includes(req.auth!.role) ? securityWarnings() : [],
    };
  });

  // ── AI providers & keys ────────────────────────────────────
  app.get("/ai/providers", async () => Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, model: p.model, free: !!p.free, tools: p.tools, keyUrl: p.keyUrl, note: p.note ?? "", custom: id === "custom" })));

  app.get("/ai/keys", async (req) => {
    const rows = await prisma.aiKey.findMany({ where: { tenantId: req.auth!.tenantId, userId: req.auth!.userId }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
    return { encryptionReady: encryptionReady(), keys: rows.map(publicKey) };
  });

  app.post("/ai/keys", async (req, reply) => {
    if (!encryptionReady()) return reply.code(400).send({ error: "The server needs a real ENCRYPTION_KEY (64 hex characters) before keys can be stored. Set it in your environment variables and restart." });
    const b = z.object({
      provider: z.string().refine((p) => p in PROVIDERS, "Unknown provider"),
      key: z.string().min(8).max(400).transform((s) => s.trim()),
      label: z.string().max(60).optional(), model: z.string().trim().max(120).optional().refine((m) => !m || MODEL_RE.test(m.replace(/^models\//, "")), "Model must be a single model ID such as gpt-4o-mini (no spaces or commas). Leave it blank to use the default."),
      baseUrl: z.string().url().max(300).optional(), shared: z.boolean().default(true),
    }).parse(req.body);
    if (b.provider === "custom" && !b.baseUrl) return reply.code(400).send({ error: "Custom providers need a base URL (e.g. http://host:11434/v1)." });
    if (b.baseUrl) {
      try { await assertPublicUrl(b.baseUrl, { allowPrivate: allowPrivateAiUrls() }); }
      catch (e: any) { return reply.code(400).send({ error: `Base URL rejected: ${e.message}. Private/local addresses are blocked on this server.` }); }
    }
    const { userId, tenantId } = req.auth!;
    if ((await prisma.aiKey.count({ where: { userId } })) >= 20) return reply.code(400).send({ error: "Key limit reached (20)." });
    const last = await prisma.aiKey.findFirst({ where: { userId }, orderBy: { priority: "desc" } });
    const test = await testKey(b.provider, b.key, b.model, b.baseUrl);
    const row = await prisma.aiKey.create({
      data: {
        tenantId, userId, provider: b.provider, label: b.label || null, model: b.model || null, baseUrl: b.baseUrl || null,
        keyEnc: encrypt(b.key), keyHint: b.key.slice(-4), priority: (last?.priority ?? -1) + 1, shared: b.shared,
        lastOkAt: test.ok ? new Date() : null, lastError: test.ok ? null : test.error ?? "Test failed",
      },
    });
    invalidateKeys(tenantId);
    return reply.code(201).send({ ...publicKey(row), test });
  });

  app.post("/ai/keys/:id/test", async (req) => {
    const { id } = req.params as any;
    const row = await prisma.aiKey.findFirst({ where: { id, userId: req.auth!.userId } });
    if (!row) throw Object.assign(new Error("Key not found"), { statusCode: 404 });
    const { decrypt } = await import("@leadhunter/integrations");
    let t: { ok: boolean; ms: number; error?: string };
    try { t = await testKey(row.provider, decrypt(row.keyEnc), row.model ?? undefined, row.baseUrl ?? undefined); }
    catch { t = { ok: false, ms: 0, error: "Stored key can't be decrypted (ENCRYPTION_KEY changed?). Delete and re-add it." }; }
    await prisma.aiKey.update({ where: { id }, data: t.ok ? { lastOkAt: new Date(), lastError: null } : { lastError: t.error ?? "failed" } });
    invalidateKeys(req.auth!.tenantId);
    return t;
  });

  app.post("/ai/keys/reorder", async (req) => {
    const { ids } = z.object({ ids: z.array(z.string()).max(50) }).parse(req.body);
    const mine = await prisma.aiKey.findMany({ where: { userId: req.auth!.userId, id: { in: ids } }, select: { id: true } });
    const ok = new Set(mine.map((m) => m.id));
    await Promise.all(ids.filter((i) => ok.has(i)).map((id, priority) => prisma.aiKey.update({ where: { id }, data: { priority } })));
    invalidateKeys(req.auth!.tenantId);
    return { ok: true };
  });

  app.patch("/ai/keys/:id", async (req) => {
    const { id } = req.params as any;
    const b = z.object({ enabled: z.boolean().optional(), shared: z.boolean().optional(), label: z.string().max(60).optional(), model: z.string().trim().max(120).nullable().optional().refine((m) => !m || MODEL_RE.test(m.replace(/^models\//, "")), "Model must be a single model ID such as gpt-4o-mini (no spaces or commas). Leave it blank to use the default.") }).parse(req.body);
    const own = await prisma.aiKey.findFirst({ where: { id, userId: req.auth!.userId }, select: { id: true } });
    if (!own) throw Object.assign(new Error("Key not found"), { statusCode: 404 });
    const row = await prisma.aiKey.update({ where: { id }, data: b });
    invalidateKeys(req.auth!.tenantId);
    return publicKey(row);
  });

  app.delete("/ai/keys/:id", async (req) => {
    const { id } = req.params as any;
    await prisma.aiKey.deleteMany({ where: { id, userId: req.auth!.userId } });
    invalidateKeys(req.auth!.tenantId); invalidatePlan(req.auth!.tenantId);
    return { ok: true };
  });

  // ── Per-user preferences (dashboard layouts) ───────────────
  app.get("/me/prefs/:key", async (req) => {
    const { key } = z.object({ key: z.string().max(60) }).parse(req.params);
    const row = await prisma.userPref.findUnique({ where: { userId_key: { userId: req.auth!.userId, key } } });
    return { value: row?.value ?? null };
  });
  app.put("/me/prefs/:key", async (req, reply) => {
    const { key } = z.object({ key: z.string().max(60) }).parse(req.params);
    const { value } = z.object({ value: z.any() }).parse(req.body);
    if (JSON.stringify(value ?? null).length > 60_000) return reply.code(413).send({ error: "Too large" });
    await prisma.userPref.upsert({ where: { userId_key: { userId: req.auth!.userId, key } }, update: { value }, create: { userId: req.auth!.userId, key, value } });
    return { ok: true };
  });

  // ── Chief-of-staff memory: goals + decision log ────────────
  app.get("/businesses/:businessId/goals", async (req) => {
    const { businessId } = req.params as any; await app.requireBusiness(req, businessId);
    return prisma.goal.findMany({ where: { businessId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 });
  });
  app.post("/businesses/:businessId/goals", async (req, reply) => {
    const { businessId } = req.params as any; await app.requireBusiness(req, businessId);
    const b = z.object({ title: z.string().min(1).max(200), lane: z.string().max(40).optional(), target: z.string().max(120).optional(), dueAt: z.string().datetime().optional() }).parse(req.body);
    return reply.code(201).send(await prisma.goal.create({ data: { businessId, title: b.title, lane: b.lane, target: b.target, dueAt: b.dueAt ? new Date(b.dueAt) : undefined } }));
  });
  app.patch("/goals/:id", async (req) => {
    const { id } = req.params as any;
    const g = await prisma.goal.findFirst({ where: { id, business: { tenantId: req.auth!.tenantId } } });
    if (!g) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    const b = z.object({ progress: z.number().int().min(0).max(100).optional(), status: z.enum(["active", "done", "paused"]).optional(), title: z.string().max(200).optional() }).parse(req.body);
    return prisma.goal.update({ where: { id }, data: { ...b, ...(b.progress === 100 && !b.status && { status: "done" }) } });
  });
  app.delete("/goals/:id", async (req) => {
    const { id } = req.params as any;
    await prisma.goal.deleteMany({ where: { id, business: { tenantId: req.auth!.tenantId } } });
    return { ok: true };
  });

  app.get("/businesses/:businessId/decisions", async (req) => {
    const { businessId } = req.params as any; await app.requireBusiness(req, businessId);
    return prisma.decision.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 50 });
  });
  app.post("/businesses/:businessId/decisions", async (req, reply) => {
    const { businessId } = req.params as any; await app.requireBusiness(req, businessId);
    const b = z.object({ title: z.string().min(1).max(200), context: z.string().max(4000).optional(), outcome: z.string().max(4000).optional() }).parse(req.body);
    const u = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { name: true, email: true } });
    return reply.code(201).send(await prisma.decision.create({ data: { businessId, ...b, decidedBy: u?.name ?? u?.email } }));
  });
  app.delete("/decisions/:id", async (req) => {
    const { id } = req.params as any;
    await prisma.decision.deleteMany({ where: { id, business: { tenantId: req.auth!.tenantId } } });
    return { ok: true };
  });

  // ── AI usage by agent (last 30 days) — cost visibility ─────
  app.get("/businesses/:businessId/ai-usage", async (req) => {
    const { businessId } = req.params as any; await app.requireBusiness(req, businessId);
    const since = new Date(Date.now() - 30 * 86400000);
    const runs = await prisma.agentRun.findMany({ where: { agent: { businessId }, startedAt: { gte: since } }, select: { tokensIn: true, tokensOut: true, status: true, agent: { select: { displayName: true } } } });
    const by: Record<string, { agent: string; runs: number; tokens: number }> = {};
    let tokens = 0;
    for (const r of runs) {
      const t = (r.tokensIn ?? 0) + (r.tokensOut ?? 0); tokens += t;
      const e = (by[r.agent.displayName] ??= { agent: r.agent.displayName, runs: 0, tokens: 0 });
      e.runs++; e.tokens += t;
    }
    return { runs: runs.length, tokens, byAgent: Object.values(by).sort((a, b) => b.tokens - a.tokens).slice(0, 8) };
  });
}
