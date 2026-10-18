import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { resolveJwtSecret } from "../lib/security";
import { appBase, isProvider, newNonce, profileFromIdToken, providerConfig, Provider, readState, redirectUri, signState } from "../lib/oauth";

const db: any = prisma;
const COOKIE = "aios_oauth";
const strict = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };
const secure = () => process.env.NODE_ENV === "production" && !appBase().startsWith("http://");
const cookie = (v: string, maxAge: number) => `${COOKIE}=${v}; Path=/v1/auth/oauth; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure() ? "; Secure" : ""}`;
const readCookie = (h?: string) => (h ?? "").split(/;\s*/).map((x) => x.split("=")).find((x) => x[0] === COOKIE)?.[1];
const fail = (reply: any, msg: string) => reply.header("Set-Cookie", cookie("", 0)).redirect(`/login?sso_error=${encodeURIComponent(msg)}`);

export async function oauthRoutes(app: FastifyInstance) {
  // Which sign-in buttons to show.
  app.get("/oauth/providers", async () => ({ google: !!providerConfig("google"), microsoft: !!providerConfig("microsoft") }));

  app.get("/oauth/:provider/start", strict, async (req, reply) => {
    const { provider } = req.params as { provider: string };
    const cfg = isProvider(provider) ? providerConfig(provider) : null;
    if (!cfg || !isProvider(provider)) return reply.code(404).send({ error: "This sign-in method is not enabled." });
    const nonce = newNonce();
    const url = new URL(cfg.authUrl);
    url.search = new URLSearchParams({
      client_id: cfg.id, redirect_uri: redirectUri(provider), response_type: "code", scope: cfg.scope,
      state: signState(resolveJwtSecret(), { p: provider, n: nonce }), nonce, prompt: "select_account",
    }).toString();
    return reply.header("Set-Cookie", cookie(nonce, 600)).redirect(url.toString());
  });

  app.get("/oauth/:provider/callback", strict, async (req, reply) => {
    const { provider } = req.params as { provider: string };
    const q = req.query as Record<string, string>;
    const cfg = isProvider(provider) ? providerConfig(provider) : null;
    if (!cfg || !isProvider(provider)) return fail(reply, "This sign-in method is not enabled.");
    if (q.error) return fail(reply, q.error === "access_denied" ? "Sign-in was cancelled." : "The provider could not sign you in.");
    const st = readState(resolveJwtSecret(), q.state);
    if (!st || st.p !== provider || !q.code || readCookie(req.headers.cookie) !== st.n) return fail(reply, "Sign-in session expired. Please try again.");
    try {
      const tr = await fetch(cfg.tokenUrl, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({ grant_type: "authorization_code", code: q.code, client_id: cfg.id, client_secret: cfg.secret, redirect_uri: redirectUri(provider) }),
      });
      const tj: any = await tr.json().catch(() => ({}));
      if (!tr.ok || !tj.id_token) { req.log.warn({ status: tr.status, err: tj.error }, "oauth token exchange failed"); return fail(reply, "The provider rejected the sign-in. Check the client ID, secret and redirect URL."); }
      const profile = profileFromIdToken(provider, tj.id_token, { clientId: cfg.id, nonce: st.n });
      const user = await resolveUser(provider, profile);
      const m = user.memberships[0];
      const token = app.jwt.sign({ userId: user.id, tenantId: m.tenantId, role: m.role });
      return reply.header("Set-Cookie", cookie("", 0)).redirect(`/login#sso=${token}`);
    } catch (e: any) {
      req.log.warn({ err: e?.message }, "oauth sign-in failed");
      return fail(reply, e?.userFacing ? e.message : "Sign-in failed. Please try again.");
    }
  });
}

const userFacing = (m: string) => Object.assign(new Error(m), { userFacing: true });

/** Finds or creates the aiOS user for a provider identity. Never links by an email the provider did not verify. */
export async function resolveUser(provider: Provider, p: { subject: string; email: string; name: string; verified: boolean }) {
  const include = { memberships: true };
  const linked = await db.oAuthIdentity.findUnique({ where: { provider_subject: { provider, subject: p.subject } } });
  if (linked) {
    const u = await db.user.findUnique({ where: { id: linked.userId }, include });
    if (u?.memberships?.[0]) return u;
    throw userFacing("This account has no workspace.");
  }
  const existing = await db.user.findUnique({ where: { email: p.email }, include });
  if (existing) {
    if (!p.verified) throw userFacing("This email is already registered. Sign in with your password or with Google, then try again.");
    const others = await db.oAuthIdentity.findMany({ where: { userId: existing.id } });
    if (others.some((o: any) => !o.verified)) throw userFacing("This email is linked to an unverified sign-in. Use your original sign-in method.");
    if (!existing.memberships?.[0]) throw userFacing("This account has no workspace.");
    await db.oAuthIdentity.create({ data: { userId: existing.id, provider, subject: p.subject, email: p.email, verified: true } });
    return existing;
  }
  const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30) + "-" + Date.now().toString(36);
  return db.user.create({
    data: {
      email: p.email, name: p.name,
      identities: { create: { provider, subject: p.subject, email: p.email, verified: p.verified } },
      memberships: { create: { role: "OWNER", tenant: { create: { name: `${p.name}'s workspace`, slug } } } },
    },
    include,
  });
}
