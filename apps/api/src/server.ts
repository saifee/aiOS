import "./lib/env";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { join, resolve, extname, sep } from "path";
import { existsSync, statSync, readFileSync } from "fs";
import multipart from "@fastify/multipart";
import rawBody from "fastify-raw-body";
import { authRoutes } from "./routes/auth";
import { oauthRoutes } from "./routes/oauth";
import { setupRoutes } from "./routes/setup";
import { businessRoutes } from "./routes/businesses";
import { campaignRoutes } from "./routes/campaigns";
import { leadRoutes } from "./routes/leads";
import { conversationRoutes } from "./routes/conversations";
import { analyticsRoutes } from "./routes/analytics";
import { webhookRoutes } from "./routes/webhooks";
import { notificationRoutes } from "./routes/notifications";
import { integrationRoutes } from "./routes/integrations";
import { voiceRoutes } from "./routes/voice";
import { commandRoutes } from "./routes/command";
import { agentRoutes } from "./routes/agents";
import { knowledgeRoutes } from "./routes/knowledge";
import { opsRoutes } from "./routes/ops";
import { biRoutes } from "./routes/bi";
import { billingRoutes } from "./routes/billing";
import { adminRoutes } from "./routes/admin";
import { sopRoutes } from "./routes/sops";
import { studioRoutes } from "./routes/studio";
import { meRoutes } from "./routes/me";
import { tenantPlugin } from "./plugins/tenant";
import { cronRoutes, startInlineScheduler } from "./routes/cron";
import { registerInlineProcessors } from "../../workers/src/registry";
import { INLINE } from "@leadhunter/agents";
import { runMigrations, ensureSchema } from "./lib/migrate";

import { jwtSecretProblem, registerSecurity, resolveJwtSecret, allowedOrigins, trustProxySetting, securityWarnings, isProd } from "./lib/security";

const app = Fastify({
  trustProxy: trustProxySetting(),
  bodyLimit: 1_048_576,
  logger: {
    // Never write credentials or PII into logs.
    redact: { paths: ["req.headers.authorization", "req.headers.cookie", "req.headers['x-cron-key']", "req.headers['x-webhook-secret']", "req.headers['x-setup-token']", "res.headers['set-cookie']"], censor: "[redacted]" },
    serializers: { req(r) { return { method: r.method, url: String(r.url).replace(/([?&](?:key|token)=)[^&]*/gi, "$1[redacted]"), host: r.host, remoteAddress: r.ip }; } },
  },
});

async function main() {
  // Fail closed but stay diagnosable: with a missing/weak JWT secret in production, serve ONLY a
  // configuration notice (no API, no data) instead of crashing into an opaque host-level 503.
  const fatal = isProd() ? jwtSecretProblem() : null;
  if (fatal) {
    app.log.error(`[security] Refusing to serve: ${fatal}. Set a strong JWT_SECRET (openssl rand -hex 32) in hPanel → Node.js → Environment variables, then restart.`);
    app.get("/health", async () => ({ ok: false, misconfigured: true }));
    app.setNotFoundHandler((req, reply) => reply.code(503).type("text/html; charset=utf-8").send(`<!doctype html><meta charset="utf-8"><title>aiOS — configuration needed</title><body style="font-family:system-ui;max-width:640px;margin:12vh auto;padding:0 20px"><h1>Configuration needed</h1><p>The server is running but is intentionally refusing requests because a required security setting is missing or too weak: <b>${fatal}</b>.</p><p>Owner: set a strong <code>JWT_SECRET</code> (at least 32 characters, e.g. <code>openssl rand -hex 32</code>) in the hosting panel's environment variables and restart the app.</p></body>`));
    const rawPort = process.env.PORT || "4000";
    await app.listen(/^\d+$/.test(rawPort) ? { port: Number(rawPort), host: "0.0.0.0" } : { path: rawPort });
    return;
  }
  const warnings = securityWarnings();
  for (const w of warnings) app.log.warn(`[security] ${w}`);
  registerSecurity(app);
  const origins = allowedOrigins();
  await app.register(cors, {
    // Bearer-token API (no cookies) → credentials stay off; only allow-listed origins; same-origin has no Origin header.
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], maxAge: 600,
  });
  await app.register(jwt, { secret: resolveJwtSecret(), sign: { algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "24h" }, verify: { algorithms: ["HS256"] } });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  // Raw body for Stripe webhook signature verification (opt-in per route via config.rawBody)
  await app.register(rawBody, { field: "rawBody", global: false, runFirst: true });
  // Multipart for SendGrid Inbound Parse (email replies arrive as multipart/form-data)
  await app.register(multipart, { attachFieldsToBody: "keyValues", limits: { fileSize: 5_000_000, files: 5 } });
  await app.register(tenantPlugin);

  app.get("/health", async () => ({ ok: true, ts: Date.now() }));

  await app.register(setupRoutes, { prefix: "/v1" });   // first-run wizard (unauthenticated)
  await app.register(authRoutes, { prefix: "/v1/auth" });
  await app.register(oauthRoutes, { prefix: "/v1/auth" }); // Google / Microsoft sign-in
  await app.register(webhookRoutes, { prefix: "/v1/webhooks" }); // unauthenticated (provider-verified)
  await app.register(businessRoutes, { prefix: "/v1/businesses" });
  await app.register(campaignRoutes, { prefix: "/v1" });
  await app.register(leadRoutes, { prefix: "/v1" });
  await app.register(conversationRoutes, { prefix: "/v1" });
  await app.register(analyticsRoutes, { prefix: "/v1" });
  await app.register(notificationRoutes, { prefix: "/v1" });
  await app.register(integrationRoutes, { prefix: "/v1" });
  await app.register(voiceRoutes, { prefix: "/v1/voice" });
  await app.register(commandRoutes, { prefix: "/v1" });
  await app.register(agentRoutes, { prefix: "/v1" });
  await app.register(meRoutes, { prefix: "/v1" });
  await app.register(knowledgeRoutes, { prefix: "/v1" });
  await app.register(opsRoutes, { prefix: "/v1" });
  await app.register(biRoutes, { prefix: "/v1" });
  await app.register(billingRoutes, { prefix: "/v1" });
  await app.register(adminRoutes, { prefix: "/v1" });
  await app.register(sopRoutes, { prefix: "/v1" });
  await app.register(studioRoutes, { prefix: "/v1" });
  await app.register(cronRoutes, { prefix: "/v1" });

  // ── Serve the exported Next.js frontend from this same process (single-app deploy) ──
  // Traversal-safe static serving (no @fastify/static dependency): every resolved
  // path is checked to stay within the frontend directory before it's sent.
  const frontendDir = resolve(process.env.FRONTEND_DIR || join(__dirname, "../../web/out"));
  const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
    ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon",
    ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
    ".txt": "text/plain",
  };
  function safeFile(rel: string): string | null {
    const full = resolve(frontendDir, rel.replace(/^\/+/, ""));
    if (full !== frontendDir && !full.startsWith(frontendDir + sep)) return null; // block path traversal
    return existsSync(full) && statSync(full).isFile() ? full : null;
  }
  if (existsSync(frontendDir)) {
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/v1")) return reply.code(404).send({ error: "Not found" });
      let urlPath: string;
      try { urlPath = decodeURIComponent(req.url.split("?")[0]); } catch { return reply.code(400).send("Bad request"); }
      // Never serve dotfiles, source maps or anything with a NUL byte / path-segment starting with "."
      if (urlPath.includes("\0") || /(^|\/)\./.test(urlPath.replace(/^\/\.well-known\//, "/")) || urlPath.endsWith(".map")) return reply.code(404).send("Not found");
      const clean = urlPath.replace(/^\/+|\/+$/g, "");
      const candidates = extname(urlPath) ? [clean] : [`${clean}.html`, `${clean}/index.html`, "index.html"];
      for (const c of candidates) {
        const full = safeFile(c);
        if (full) {
          // Pages must always be revalidated (a phone holding an old page that points at deleted chunks makes Next reload forever);
          // hashed build files never change, so they can be cached hard.
          const immutable = /[\\/]_next[\\/]static[\\/]/.test(full);
          reply.header("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
        }
        if (full) return reply.type(MIME[extname(full)] || "application/octet-stream").send(readFileSync(full));
      }
      return reply.code(404).send("Not found");
    });
  }

  if (isProd()) app.log.info("Production security profile active (HSTS, strict CORS, JWT secret enforced).");
  if (process.env.AUTO_MIGRATE === "true") await runMigrations(app.log);
  await ensureSchema(app.log); // idempotent: adds any table an older database is missing

  // No Redis? Run the background workers inside this process.
  if (INLINE) {
    registerInlineProcessors();
    if (process.env.CRON_SECRET || process.env.INLINE_SCHEDULER !== "false") startInlineScheduler();
    app.log.info("Inline mode: background jobs run inside the API process.");
  }

  // Passenger (Hostinger) supplies PORT as a number or a socket path.
  const raw = process.env.PORT || "4000";
  await app.listen(/^\d+$/.test(raw) ? { port: Number(raw), host: "0.0.0.0" } : { path: raw });
}
main().catch((e) => {
  app.log.error(e);
  const fb = (globalThis as any).__aiosFallback; // set by app.js on Hostinger: keep a diagnostic responder instead of an opaque 503
  if (typeof fb === "function") fb(e); else process.exit(1);
});
