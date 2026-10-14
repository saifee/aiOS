import Fastify from "fastify";
import jwt from "@fastify/jwt";
import cors from "@fastify/cors";
import rawBody from "fastify-raw-body";
import rateLimit from "@fastify/rate-limit";
import { vi } from "vitest";
import { tenantPlugin } from "../plugins/tenant";
import { registerSecurity, allowedOrigins } from "../lib/security";

export const SECRET = "x".repeat(40);

import { db } from "./dbmock";
export { db };

export async function buildApp(register: (app: ReturnType<typeof Fastify>) => Promise<void> | void) {
  const app = Fastify({ logger: false });
  registerSecurity(app);
  await app.register(cors, { origin: (o, cb) => cb(null, !o || allowedOrigins().includes(o)) });
  await app.register(jwt, { secret: SECRET, sign: { algorithm: "HS256", expiresIn: "1h" }, verify: { algorithms: ["HS256"] } });
  await app.register(rateLimit, { max: 1000, timeWindow: "1 minute" });
  await app.register(rawBody, { field: "rawBody", global: false, runFirst: true });
  await app.register(tenantPlugin);
  await register(app);
  await app.ready();
  return app;
}
export const bearer = (app: any, userId: string, tenantId: string) => ({ authorization: `Bearer ${app.jwt.sign({ userId, tenantId, role: "OWNER" })}` });
