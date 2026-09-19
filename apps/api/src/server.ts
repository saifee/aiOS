import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { join, resolve, extname, sep } from "path";
import { existsSync, statSync, readFileSync } from "fs";
import multipart from "@fastify/multipart";
import rawBody from "fastify-raw-body";
import { authRoutes } from "./routes/auth";
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
import { sopRoutes } from "./routes/sops";
import { studioRoutes } from "./routes/studio";
import { tenantPlugin } from "./plugins/tenant";

const app = Fastify({ logger: true });

async function main() {
  await app.register(cors, { origin: true, credentials: true });
  await app.register(jwt, { secret: process.env.JWT_SECRET || "dev-secret" });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  // Raw body for Stripe webhook signature verification (opt-in per route via config.rawBody)
  await app.register(rawBody, { field: "rawBody", global: false, runFirst: true });
  // Multipart for SendGrid Inbound Parse (email replies arrive as multipart/form-data)
  await app.register(multipart, { attachFieldsToBody: "keyValues", limits: { fileSize: 5_000_000, files: 5 } });
  await app.register(tenantPlugin);

  app.get("/health", async () => ({ ok: true, ts: Date.now() }));

  await app.register(setupRoutes, { prefix: "/v1" });   // first-run wizard (unauthenticated)
  await app.register(authRoutes, { prefix: "/v1/auth" });
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
  await app.register(knowledgeRoutes, { prefix: "/v1" });
  await app.register(opsRoutes, { prefix: "/v1" });
  await app.register(biRoutes, { prefix: "/v1" });
  await app.register(billingRoutes, { prefix: "/v1" });
  await app.register(sopRoutes, { prefix: "/v1" });
  await app.register(studioRoutes, { prefix: "/v1" });

  // ── Serve the exported Next.js frontend from this same process (single-app deploy) ──
  // Traversal-safe static serving (no @fastify/static dependency): every resolved
  // path is checked to stay within the frontend directory before it's sent.
  const frontendDir = resolve(process.env.FRONTEND_DIR || join(process.cwd(), "apps/web/out"));
  const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
    ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon",
    ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
    ".txt": "text/plain", ".map": "application/json",
  };
  function safeFile(rel: string): string | null {
    const full = resolve(frontendDir, rel.replace(/^\/+/, ""));
    if (full !== frontendDir && !full.startsWith(frontendDir + sep)) return null; // block path traversal
    return existsSync(full) && statSync(full).isFile() ? full : null;
  }
  if (existsSync(frontendDir)) {
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/v1")) return reply.code(404).send({ error: "Not found" });
      const urlPath = decodeURIComponent(req.url.split("?")[0]);
      const clean = urlPath.replace(/^\/+|\/+$/g, "");
      const candidates = extname(urlPath) ? [clean] : [`${clean}.html`, `${clean}/index.html`, "index.html"];
      for (const c of candidates) {
        const full = safeFile(c);
        if (full) return reply.type(MIME[extname(full)] || "application/octet-stream").send(readFileSync(full));
      }
      return reply.code(404).send("Not found");
    });
  }

  const port = Number(process.env.PORT || 4000);
  await app.listen({ port, host: "0.0.0.0" });
}
main().catch((e) => { app.log.error(e); process.exit(1); });
