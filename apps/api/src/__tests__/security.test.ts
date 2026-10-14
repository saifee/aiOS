import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
import { db, buildApp, bearer, SECRET } from "./helpers";

vi.mock("@leadhunter/db", async () => { const { db: d } = await import("./dbmock"); return { prisma: d, arr: (v: any) => v ?? [], findLeadByListValue: vi.fn() }; });
vi.mock("../lib/queues", () => ({ queues: { notify: { add: vi.fn() }, conversation: { add: vi.fn() } } }));

import { notificationRoutes } from "../routes/notifications";
import { authRoutes } from "../routes/auth";
import { setupRoutes } from "../routes/setup";
import { voiceRoutes } from "../routes/voice";
import { webhookRoutes } from "../routes/webhooks";
import { integrationRoutes } from "../routes/integrations";
import { clearMembershipCache } from "../plugins/tenant";
import { jwtSecretProblem, verifyTwilioSignature, xmlEscape, verifyMetaSignature } from "../lib/security";

beforeEach(() => { vi.clearAllMocks(); clearMembershipCache(); process.env.NODE_ENV = "test"; delete process.env.ALLOW_UNSIGNED_WEBHOOKS; });
const member = (role: string | null) => db.membership.findFirst.mockResolvedValue(role ? { role } : null);

describe("authentication & tenant isolation", () => {
  it("rejects requests without a token", async () => {
    const app = await buildApp((a) => a.register(notificationRoutes));
    expect((await app.inject({ method: "GET", url: "/notifications" })).statusCode).toBe(401);
  });
  it("rejects a validly-signed token whose user was removed from the tenant", async () => {
    member(null);
    const app = await buildApp((a) => a.register(notificationRoutes));
    expect((await app.inject({ method: "GET", url: "/notifications", headers: bearer(app, "u1", "t1") })).statusCode).toBe(401);
  });
  it("rejects tokens signed with a different algorithm (alg=none / HS512)", async () => {
    member("OWNER");
    const app = await buildApp((a) => a.register(notificationRoutes));
    const none = Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url") + "." + Buffer.from('{"userId":"u1","tenantId":"t1"}').toString("base64url") + ".";
    expect((await app.inject({ method: "GET", url: "/notifications", headers: { authorization: `Bearer ${none}` } })).statusCode).toBe(401);
    const hs512 = app.jwt.sign({ userId: "u1", tenantId: "t1" }, { algorithm: "HS512" } as any);
    expect((await app.inject({ method: "GET", url: "/notifications", headers: { authorization: `Bearer ${hs512}` } })).statusCode).toBe(401);
  });
  it("IDOR: marking another user's notification read is scoped by userId and 404s", async () => {
    member("OWNER");
    db.notification.updateMany.mockResolvedValue({ count: 0 });
    const app = await buildApp((a) => a.register(notificationRoutes));
    const r = await app.inject({ method: "POST", url: "/notifications/victim-notif/read", headers: bearer(app, "attacker", "t1") });
    expect(r.statusCode).toBe(404);
    expect(db.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "victim-notif", userId: "attacker" } }));
  });
  it("cross-tenant business access is denied (requireBusiness)", async () => {
    member("OWNER");
    db.business.findFirst.mockResolvedValue(null);
    const app = await buildApp((a) => a.register(integrationRoutes));
    const r = await app.inject({ method: "GET", url: "/businesses/other-tenants-biz/integrations", headers: bearer(app, "u1", "t1") });
    expect(r.statusCode).toBe(404);
    expect(db.business.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "other-tenants-biz", tenantId: "t1" } }));
  });
  it("role comes from the DB: a VIEWER cannot write integration credentials even with an OWNER-claiming token", async () => {
    member("VIEWER");
    const app = await buildApp((a) => a.register(integrationRoutes));
    const r = await app.inject({ method: "PUT", url: "/businesses/b1/integrations/sendgrid", headers: bearer(app, "u1", "t1"), payload: { credentials: { k: "v" } } });
    expect(r.statusCode).toBe(403);
    expect(db.integration.upsert).not.toHaveBeenCalled();
  });
  it("VIEWER is read-only on mutating routes (deny by default) but can read", async () => {
    member("VIEWER"); db.notification.findMany.mockResolvedValue([]);
    const app = await buildApp((a) => { a.register(notificationRoutes); a.post("/v1/leads", { onRequest: (r: any) => a.authenticate(r) }, async () => ({ created: true })); });
    const h = bearer(app, "u1", "t1");
    expect((await app.inject({ method: "GET", url: "/notifications", headers: h })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/leads", headers: h, payload: {} })).statusCode).toBe(403);
  });
  it("integration PUT never echoes credentials and rejects unknown providers / extra fields", async () => {
    member("OWNER"); db.business.findFirst.mockResolvedValue({ id: "b1" });
    process.env.ENCRYPTION_KEY = "ab".repeat(32);
    db.integration.upsert.mockResolvedValue({ id: "i1", credentials: { enc: "SECRET" } });
    const app = await buildApp((a) => a.register(integrationRoutes));
    const h = bearer(app, "u1", "t1");
    const ok = await app.inject({ method: "PUT", url: "/businesses/b1/integrations/sendgrid", headers: h, payload: { credentials: { apiKey: "sg" } } });
    expect(ok.statusCode).toBe(200); expect(ok.body).not.toContain("SECRET"); expect(ok.body).not.toContain("enc");
    expect((await app.inject({ method: "PUT", url: "/businesses/b1/integrations/evil", headers: h, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: "/businesses/b1/integrations/sendgrid", headers: h, payload: { status: "x" } })).statusCode).toBe(400);
  });
});

describe("webhook authenticity", () => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: "966500000000", text: { body: "hi" } }] } }] }] });
  const post = (app: any, url: string, payload: string, headers: Record<string, string> = {}) => app.inject({ method: "POST", url, payload, headers: { "content-type": "application/json", ...headers } });

  it("WhatsApp: unsigned / badly signed requests are rejected, correctly signed accepted", async () => {
    process.env.WHATSAPP_APP_SECRET = "appsecret";
    db.lead.findFirst.mockResolvedValue(null);
    const app = await buildApp((a) => a.register(webhookRoutes));
    expect((await post(app, "/whatsapp", body)).statusCode).toBe(401);
    expect((await post(app, "/whatsapp", body, { "x-hub-signature-256": "sha256=" + "0".repeat(64) })).statusCode).toBe(401);
    const sig = "sha256=" + createHmac("sha256", "appsecret").update(body).digest("hex");
    expect((await post(app, "/whatsapp", body, { "x-hub-signature-256": sig })).statusCode).toBe(200);
  });
  it("WhatsApp: fails closed when no app secret is configured", async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const app = await buildApp((a) => a.register(webhookRoutes));
    expect((await post(app, "/whatsapp", body, { "x-hub-signature-256": "sha256=abc" })).statusCode).toBe(401);
  });
  it("calendar/booked: cannot tamper with a lead without the shared secret (cross-tenant write blocked)", async () => {
    process.env.WEBHOOK_SHARED_SECRET = "shared-secret-value";
    db.lead.findUnique.mockResolvedValue({ id: "lead1" });
    const app = await buildApp((a) => a.register(webhookRoutes));
    const payload = JSON.stringify({ leadId: "lead1", startsAt: "2030-01-01T10:00:00Z" });
    expect((await post(app, "/calendar/booked", payload)).statusCode).toBe(401);
    expect(db.meeting.create).not.toHaveBeenCalled();
    expect((await post(app, "/calendar/booked?token=shared-secret-value", payload)).statusCode).toBe(200);
    expect(db.meeting.create).toHaveBeenCalledTimes(1);
  });
  it("calendar/booked: validates the payload", async () => {
    process.env.WEBHOOK_SHARED_SECRET = "shared-secret-value";
    const app = await buildApp((a) => a.register(webhookRoutes));
    expect((await post(app, "/calendar/booked?token=shared-secret-value", JSON.stringify({ leadId: "x", startsAt: "not-a-date" }))).statusCode).toBe(400);
  });
  it("email inbound requires the shared token", async () => {
    process.env.WEBHOOK_SHARED_SECRET = "shared-secret-value";
    const app = await buildApp((a) => a.register(webhookRoutes));
    expect((await post(app, "/email/inbound", JSON.stringify({ from: "a@b.co", text: "stop" }))).statusCode).toBe(401);
  });
  it("Stripe webhook without a signature header is rejected", async () => {
    const app = await buildApp((a) => a.register(webhookRoutes));
    expect((await post(app, "/stripe", "{}")).statusCode).toBe(400);
  });
  it("signature helpers (Meta, Twilio) verify correctly and reject tampering", () => {
    const sig = "sha256=" + createHmac("sha256", "s").update("raw").digest("hex");
    expect(verifyMetaSignature("raw", sig, "s")).toBe(true);
    expect(verifyMetaSignature("raw2", sig, "s")).toBe(false);
    const url = "https://x.test/v1/voice/incoming?businessId=b1", params = { From: "+1", CallSid: "CA1" };
    const tw = createHmac("sha1", "tok").update(url + "CallSidCA1From+1").digest("base64");
    expect(verifyTwilioSignature(url, params, tw, "tok")).toBe(true);
    expect(verifyTwilioSignature(url, { ...params, From: "+2" }, tw, "tok")).toBe(false);
    expect(verifyTwilioSignature(url, params, tw, undefined)).toBe(false);
  });
  it("TwiML values are XML-escaped", () => { expect(xmlEscape('"><Dial>evil</Dial>')).toBe("&quot;&gt;&lt;Dial&gt;evil&lt;/Dial&gt;"); });
});

describe("headers, CORS and error handling", () => {
  it("sets security headers and no-store on API responses", async () => {
    const app = await buildApp((a) => { a.get("/v1/x", async () => ({ ok: 1 })); });
    const r = await app.inject({ method: "GET", url: "/v1/x" });
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-frame-options"]).toBe("DENY");
    expect(r.headers["referrer-policy"]).toBeTruthy();
    expect(r.headers["cache-control"]).toBe("no-store");
  });
  it("HTML responses carry a CSP forbidding framing and plugins", async () => {
    const app = await buildApp((a) => { a.get("/", async (_q: any, rep: any) => rep.type("text/html").send("<p>x</p>")); });
    const csp = String((await app.inject({ method: "GET", url: "/" })).headers["content-security-policy"]);
    expect(csp).toContain("frame-ancestors 'none'"); expect(csp).toContain("object-src 'none'");
  });
  it("CORS does not reflect arbitrary origins", async () => {
    process.env.APP_URL = "https://aios.example.com";
    const app = await buildApp((a) => { a.get("/v1/x", async () => ({ ok: 1 })); });
    const evil = await app.inject({ method: "GET", url: "/v1/x", headers: { origin: "https://evil.example" } });
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
    const good = await app.inject({ method: "GET", url: "/v1/x", headers: { origin: "https://aios.example.com" } });
    expect(good.headers["access-control-allow-origin"]).toBe("https://aios.example.com");
  });
  it("5xx errors never leak internals; 4xx keep their message", async () => {
    const app = await buildApp((a) => {
      a.get("/boom", async () => { throw new Error("connect ECONNREFUSED mysql://user:pw@host/db"); });
      a.get("/nf", async () => { throw Object.assign(new Error("Not found"), { statusCode: 404 }); });
    });
    const r = await app.inject({ method: "GET", url: "/boom" });
    expect(r.statusCode).toBe(500); expect(r.body).not.toContain("mysql"); expect(r.body).not.toContain("pw");
    expect((await app.inject({ method: "GET", url: "/nf" })).json().error).toBe("Not found");
  });
});

describe("secrets configuration", () => {
  it("flags missing, short and default JWT secrets", () => {
    expect(jwtSecretProblem(undefined)).toMatch(/not set/);
    expect(jwtSecretProblem("short")).toMatch(/32/);
    expect(jwtSecretProblem("dev-secret" + "x".repeat(30))).toMatch(/default/);
    expect(jwtSecretProblem("a1".repeat(32))).toBeNull();
  });
  it("test secret used by the harness is acceptable", () => { expect(jwtSecretProblem(SECRET)).toBeNull(); });
});

describe("auth, setup and voice routes", () => {
  const json = (o: unknown) => JSON.stringify(o);
  const H = { "content-type": "application/json" };
  it("register rejects mass-assignment (role/plan/tenantId) and short passwords", async () => {
    const app = await buildApp((a) => a.register(authRoutes, { prefix: "/auth" }));
    const base = { email: "a@b.co", password: "correct-horse-1", name: "A", tenantName: "T" };
    for (const extra of [{ role: "OWNER" }, { plan: "ENTERPRISE" }, { tenantId: "victim" }]) {
      expect((await app.inject({ method: "POST", url: "/auth/register", headers: H, payload: json({ ...base, ...extra }) })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: "POST", url: "/auth/register", headers: H, payload: json({ ...base, password: "short" }) })).statusCode).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it("register returns 409 for an existing email (no 500 / no orphan tenant)", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u" });
    const app = await buildApp((a) => a.register(authRoutes, { prefix: "/auth" }));
    const r = await app.inject({ method: "POST", url: "/auth/register", headers: H, payload: json({ email: "A@B.co", password: "correct-horse-1", name: "A", tenantName: "T" }) });
    expect(r.statusCode).toBe(409);
    expect(db.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "a@b.co" } })); // normalised
  });
  it("login: unknown user and wrong password give the same 401 body", async () => {
    const app = await buildApp((a) => a.register(authRoutes, { prefix: "/auth" }));
    db.user.findUnique.mockResolvedValue(null);
    const a1 = await app.inject({ method: "POST", url: "/auth/login", headers: H, payload: json({ email: "no@one.co", password: "whatever-123" }) });
    const pw = await (await import("../lib/password")).default.hash("right-password-1");
    db.user.findUnique.mockResolvedValue({ id: "u", email: "x@y.co", passwordHash: pw, memberships: [{ tenantId: "t", role: "OWNER" }] });
    const a2 = await app.inject({ method: "POST", url: "/auth/login", headers: H, payload: json({ email: "x@y.co", password: "wrong-password-1" }) });
    expect(a1.statusCode).toBe(401); expect(a2.statusCode).toBe(401); expect(a1.body).toBe(a2.body);
    const ok = await app.inject({ method: "POST", url: "/auth/login", headers: H, payload: json({ email: "X@Y.co", password: "right-password-1" }) });
    expect(ok.statusCode).toBe(200); expect(ok.json().token).toBeTruthy();
  });
  it("setup/init requires SETUP_TOKEN when set, and refuses once configured", async () => {
    process.env.SETUP_TOKEN = "setup-token-123";
    db.user.count.mockResolvedValue(0);
    const app = await buildApp((a) => a.register(setupRoutes));
    const body = json({ name: "A", email: "a@b.co", password: "correct-horse-1", company: "C" });
    expect((await app.inject({ method: "POST", url: "/setup/init", headers: H, payload: body })).statusCode).toBe(403);
    db.user.count.mockResolvedValue(1);
    expect((await app.inject({ method: "POST", url: "/setup/init", headers: { ...H, "x-setup-token": "setup-token-123" }, payload: body })).statusCode).toBe(409);
    delete process.env.SETUP_TOKEN;
  });
  it("setup/status hides database error detail in production", async () => {
    process.env.NODE_ENV = "production";
    db.user.count.mockRejectedValue(new Error("Access denied for user 'u1'@'localhost' (using password: YES)"));
    const app = await buildApp((a) => a.register(setupRoutes));
    const r = await app.inject({ method: "GET", url: "/setup/status" });
    expect(r.body).not.toContain("Access denied"); expect(r.body).not.toContain("u1");
  });
  it("voice webhooks reject unsigned requests and accept a valid Twilio signature", async () => {
    process.env.TWILIO_AUTH_TOKEN = "tok"; process.env.APP_URL = "https://aios.example.com";
    db.business.findUnique.mockResolvedValue({ id: "b1", tenantId: "t1" });
    const app = await buildApp((a) => a.register(voiceRoutes, { prefix: "/voice" }));
    const form = "From=%2B966500000000&To=%2B1&CallSid=CA1";
    const H2 = { "content-type": "application/x-www-form-urlencoded" };
    expect((await app.inject({ method: "POST", url: "/voice/status", headers: H2, payload: form })).statusCode).toBe(403);
    const sig = createHmac("sha1", "tok").update("https://aios.example.com/voice/statusCallSidCA1From+966500000000To+1").digest("base64");
    expect((await app.inject({ method: "POST", url: "/voice/status", headers: { ...H2, "x-twilio-signature": sig }, payload: form })).statusCode).toBe(200);
  });
});
