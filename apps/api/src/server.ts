import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import fstatic from "@fastify/static";
import { join, resolve, extname } from "path";
import { existsSync } from "fs";
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
  const frontendDir = resolve(process.env.FRONTEND_DIR || join(process.cwd(), "apps/web/out"));
  if (existsSync(frontendDir)) {
    await app.register(fstatic, { root: frontendDir, wildcard: false });
    // SPA-ish fallback: map /route → route.html → route/index.html → index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/v1")) return reply.code(404).send({ error: "Not found" });
      if (extname(req.url)) return reply.code(404).send("Not found");
      const clean = req.url.split("?")[0].replace(/^\/+|\/+$/g, "");
      for (const cand of [`${clean}.html`, `${clean}/index.html`, "index.html"]) {
        if (existsSync(join(frontendDir, cand))) return reply.type("text/html").sendFile(cand);
      }
      return reply.code(404).send("Not found");
    });
  }

  const port = Number(process.env.PORT || 4000);
  await app.listen({ port, host: "0.0.0.0" });
}
main().catch((e) => { app.log.error(e); process.exit(1); });
