import { createHmac, timingSafeEqual, randomBytes, verify as cryptoVerify, createPublicKey } from "crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { encryptionConfigured } from "@leadhunter/integrations";

/** Central, environment-aware security configuration. No provider (Cloudflare etc.) is mandatory. */
export const isProd = () => process.env.NODE_ENV === "production";
const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function jwtSecretProblem(secret = process.env.JWT_SECRET): string | null {
  if (!secret) return "JWT_SECRET is not set";
  if (secret.length < 32) return "JWT_SECRET must be at least 32 characters";
  if (/^(dev-secret|changeme|secret|password)/i.test(secret)) return "JWT_SECRET is a known default";
  return null;
}

/** Resolve the JWT secret. Production refuses to boot with a missing/weak secret; dev gets an ephemeral random one. */
export function resolveJwtSecret(): string {
  const problem = jwtSecretProblem();
  if (!problem) return process.env.JWT_SECRET!;
  if (isProd()) throw new Error(`Refusing to start: ${problem}. Generate one with: openssl rand -hex 32`);
  console.warn(`[security] ${problem} — using an ephemeral random secret (sessions reset on restart).`);
  return randomBytes(32).toString("hex");
}

/** Allowed browser origins: APP_URL + CORS_ORIGINS. Same-origin requests (no Origin header) always work. */
export function allowedOrigins(): string[] {
  const o = [...list(process.env.CORS_ORIGINS)];
  if (process.env.APP_URL) { try { o.push(new URL(process.env.APP_URL).origin); } catch { /* ignore */ } }
  if (!isProd()) o.push("http://localhost:3000", "http://localhost:4000", "http://127.0.0.1:3000");
  return [...new Set(o)];
}

/** trustProxy is opt-in: only honour X-Forwarded-* when the operator says a trusted proxy sits in front. */
export function trustProxySetting(): boolean | string[] {
  const v = process.env.TRUST_PROXY;
  if (!v || v === "false") return false;
  if (v === "true") return true;
  // Anything else must be a list of proxy IPs/CIDRs; an unparsable value must never crash startup.
  const l = list(v);
  const ok = l.every((x) => /^[0-9a-f:.]+(\/\d{1,3})?$/i.test(x) || ["loopback", "linklocal", "uniquelocal"].includes(x));
  return ok ? l : false;
}

/** Startup self-check; returns human-readable warnings for the owner (never secrets). */
export function securityWarnings(): string[] {
  const w: string[] = [];
  const jp = jwtSecretProblem(); if (jp) w.push(jp);
  if (!encryptionConfigured()) w.push("ENCRYPTION_KEY is missing/invalid — API keys and integration credentials cannot be stored safely.");
  if (!process.env.CRON_SECRET) w.push("CRON_SECRET is not set — the external cron endpoint is disabled.");
  if (isProd() && !process.env.APP_URL) w.push("APP_URL is not set — CORS will only allow same-origin requests.");
  if (isProd() && !process.env.TRUST_PROXY) w.push("TRUST_PROXY is not set — per-IP rate limits see the proxy address. Set TRUST_PROXY=true behind Hostinger/Cloudflare.");
  return w;
}

export const CSP = [
  "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'",
  // Next.js static export emits inline bootstrap scripts; nonces need SSR. Documented residual risk.
  "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:",
  "font-src 'self' data:", "connect-src 'self'",
].join("; ");

export function registerSecurity(app: FastifyInstance) {
  app.addHook("onSend", async (req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    reply.header("Cross-Origin-Opener-Policy", "same-origin");
    reply.header("Cross-Origin-Resource-Policy", "same-site");
    if (isProd()) reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    const ct = String(reply.getHeader("content-type") ?? "");
    if (ct.startsWith("text/html")) reply.header("Content-Security-Policy", CSP);
    if (req.url.startsWith("/v1")) reply.header("Cache-Control", "no-store");
  });

  // One place decides what clients may learn about failures: 4xx keep their message, 5xx never leak internals.
  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: "Invalid request", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    const status = Number(err.statusCode) >= 400 && Number(err.statusCode) < 600 ? Number(err.statusCode) : 500;
    if (err?.code === "P2021" || err?.code === "P2022" || /does not exist in the current database/.test(String(err?.message)))
      { req.log.error({ err }, "database schema out of date"); return reply.code(503).send({ error: "The database is missing a table or column. Restart the app (it repairs itself on start) or run docs/upgrade-existing-database.sql." }); }
    if (status >= 500) { req.log.error({ err }, "request failed"); return reply.code(status).send({ error: "Internal server error" }); }
    return reply.code(status).send({ error: err.message || "Request failed" });
  });
}

// ── Webhook verification helpers ────────────────────────────────────────────
const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export const hmacHex = (secret: string, data: string | Buffer, algo = "sha256") => createHmac(algo, secret).update(data).digest("hex");

/** Meta/WhatsApp: header "sha256=<hex>" over the raw body. */
export function verifyMetaSignature(raw: string | Buffer | undefined, header: unknown, appSecret = process.env.WHATSAPP_APP_SECRET): boolean {
  if (!appSecret || !raw || typeof header !== "string" || !header.startsWith("sha256=")) return false;
  return safeEq(header.slice(7), hmacHex(appSecret, raw));
}

/** Twilio: base64 HMAC-SHA1 over full URL + sorted form params (key+value). */
export function verifyTwilioSignature(url: string, params: Record<string, string>, header: unknown, token = process.env.TWILIO_AUTH_TOKEN): boolean {
  if (!token || typeof header !== "string") return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return safeEq(header, createHmac("sha1", token).update(data).digest("base64"));
}

/** SendGrid signed Event Webhook (ECDSA/SHA-256 over timestamp + raw body). Public key is base64 DER from SendGrid. */
export function verifySendgridSignature(raw: string | Buffer | undefined, sig: unknown, ts: unknown, pubKey = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY): boolean {
  if (!pubKey || !raw || typeof sig !== "string" || typeof ts !== "string") return false;
  try {
    const key = createPublicKey({ key: Buffer.from(pubKey, "base64"), format: "der", type: "spki" });
    return cryptoVerify("sha256", Buffer.concat([Buffer.from(ts), Buffer.from(raw)]), key, Buffer.from(sig, "base64"));
  } catch { return false; }
}

/** Generic shared-secret check (header x-webhook-secret or ?token=). Used where a provider can't sign. */
export function verifySharedSecret(req: FastifyRequest, secret = process.env.WEBHOOK_SHARED_SECRET): boolean {
  if (!secret) return false;
  const given = (req.headers["x-webhook-secret"] as string) ?? (req.query as any)?.token;
  return typeof given === "string" && safeEq(given, secret);
}

export const xmlEscape = (s: unknown) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
