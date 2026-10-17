import { describe, it, expect, vi, beforeEach } from "vitest";
import { db, buildApp, bearer } from "./helpers";

vi.mock("@leadhunter/db", async () => { const { db: d } = await import("./dbmock"); return { prisma: d, arr: (v: any) => v ?? [], findLeadByListValue: vi.fn() }; });

import { adminRoutes } from "../routes/admin";
import { billingRoutes } from "../routes/billing";
import { clearMembershipCache } from "../plugins/tenant";
import { clearPaymentCache } from "../lib/payments";

beforeEach(() => {
  vi.clearAllMocks(); clearMembershipCache(); clearPaymentCache(); process.env.NODE_ENV = "test"; delete process.env.SUPERADMIN_EMAILS;
  process.env.ENCRYPTION_KEY = "ab".repeat(32);
  db.membership.findFirst.mockResolvedValue({ role: "OWNER", tenantId: "t1" });
  db.platformSetting.findUnique.mockResolvedValue(null);
  db.auditLog.create.mockResolvedValue({});
});
// "first-ever user" is u-admin; everyone else is a normal workspace owner.
const asFirstUser = () => { db.user.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, email: `${where.id}@x.test` })); db.user.findFirst.mockResolvedValue({ id: "u-admin" }); };

describe("superadmin authorization", () => {
  it("rejects anonymous requests", async () => {
    const app = await buildApp((a) => a.register(adminRoutes));
    expect((await app.inject({ method: "GET", url: "/admin/users" })).statusCode).toBe(401);
  });
  it("a normal workspace OWNER cannot list users, change plans, record payments or touch payment methods", async () => {
    asFirstUser();
    const app = await buildApp((a) => a.register(adminRoutes));
    const h = bearer(app, "u-regular", "t1");
    for (const [method, url, payload] of [
      ["GET", "/admin/users", undefined], ["GET", "/admin/tenants/t2", undefined], ["GET", "/admin/payments", undefined],
      ["PUT", "/admin/tenants/t2/subscription", { plan: "SCALE" }], ["POST", "/admin/tenants/t2/payments", { amount: 10 }],
      ["GET", "/admin/payment-methods", undefined], ["PUT", "/admin/payment-methods", { stripe: { enabled: true } }],
    ] as const) {
      const r = await app.inject({ method, url, headers: h, payload: payload as any });
      expect(r.statusCode, `${method} ${url}`).toBe(403);
    }
    expect(db.subscription.upsert).not.toHaveBeenCalled();
    expect(db.payment.create).not.toHaveBeenCalled();
    expect(db.platformSetting.upsert).not.toHaveBeenCalled();
  });
  it("SUPERADMIN_EMAILS overrides the first-user default", async () => {
    asFirstUser(); process.env.SUPERADMIN_EMAILS = "boss@x.test";
    const app = await buildApp((a) => a.register(adminRoutes));
    expect((await app.inject({ method: "GET", url: "/admin/users", headers: bearer(app, "u-admin", "t1") })).statusCode).toBe(403);
  });
});

describe("superadmin actions", () => {
  it("lists users with workspaces and subscriptions", async () => {
    asFirstUser();
    db.user.count.mockResolvedValue(1);
    db.user.findMany.mockResolvedValue([{ id: "u9", email: "a@b.c", name: "A", createdAt: new Date(), memberships: [{ role: "OWNER", tenant: { id: "t9", name: "Acme", plan: "FREE" } }] }]);
    db.subscription.findMany.mockResolvedValue([{ tenantId: "t9", plan: "GROWTH", status: "active", currentPeriodEnd: null }]);
    const app = await buildApp((a) => a.register(adminRoutes));
    const r = await app.inject({ method: "GET", url: "/admin/users", headers: bearer(app, "u-admin", "t1") });
    expect(r.statusCode).toBe(200);
    expect(r.json().users[0].workspaces[0]).toMatchObject({ id: "t9", plan: "GROWTH", status: "active" });
    expect(JSON.stringify(r.json())).not.toMatch(/passwordHash/);
  });
  it("allocates a subscription and writes an audit entry", async () => {
    asFirstUser();
    db.tenant.findUnique.mockResolvedValue({ id: "t9" });
    db.subscription.upsert.mockResolvedValue({ plan: "SCALE", status: "active", currentPeriodEnd: null });
    const app = await buildApp((a) => a.register(adminRoutes));
    const r = await app.inject({ method: "PUT", url: "/admin/tenants/t9/subscription", headers: bearer(app, "u-admin", "t1"), payload: { plan: "SCALE" } });
    expect(r.statusCode).toBe(200);
    expect(db.tenant.update).toHaveBeenCalledWith({ where: { id: "t9" }, data: { plan: "SCALE" } });
    expect(db.auditLog.create).toHaveBeenCalled();
  });
  it("rejects an unknown plan", async () => {
    asFirstUser();
    const app = await buildApp((a) => a.register(adminRoutes));
    const r = await app.inject({ method: "PUT", url: "/admin/tenants/t9/subscription", headers: bearer(app, "u-admin", "t1"), payload: { plan: "GOD" } });
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });
  it("records a manual payment and extends the plan", async () => {
    asFirstUser();
    db.tenant.findUnique.mockResolvedValue({ id: "t9" });
    db.subscription.findUnique.mockResolvedValue(null);
    db.payment.create.mockImplementation(async ({ data }: any) => ({ id: "p1", ...data }));
    const app = await buildApp((a) => a.register(adminRoutes));
    const r = await app.inject({ method: "POST", url: "/admin/tenants/t9/payments", headers: bearer(app, "u-admin", "t1"), payload: { amount: 149.5, method: "bank_transfer", reference: "TT-1", activatePlan: "STARTER", months: 3 } });
    expect(r.statusCode).toBe(200);
    expect(db.payment.create.mock.calls[0][0].data).toMatchObject({ tenantId: "t9", amountCents: 14950, plan: "STARTER", recordedBy: "u-admin" });
    expect(new Date(r.json().currentPeriodEnd).getTime()).toBeGreaterThan(Date.now() + 80 * 864e5);
  });
  it("refuses negative or absurd amounts", async () => {
    asFirstUser();
    const app = await buildApp((a) => a.register(adminRoutes));
    for (const amount of [-5, 0, 1e12]) {
      const r = await app.inject({ method: "POST", url: "/admin/tenants/t9/payments", headers: bearer(app, "u-admin", "t1"), payload: { amount } });
      expect(r.statusCode).toBeGreaterThanOrEqual(400);
    }
    expect(db.payment.create).not.toHaveBeenCalled();
  });
  it("404s for a workspace that does not exist", async () => {
    asFirstUser(); db.tenant.findUnique.mockResolvedValue(null);
    const app = await buildApp((a) => a.register(adminRoutes));
    expect((await app.inject({ method: "PUT", url: "/admin/tenants/nope/subscription", headers: bearer(app, "u-admin", "t1"), payload: { plan: "FREE" } })).statusCode).toBe(404);
  });
});

describe("payment methods", () => {
  it("stores Stripe secrets encrypted and never returns them", async () => {
    asFirstUser();
    const app = await buildApp((a) => a.register(adminRoutes));
    const secret = "sk_test_ABCDEF1234567890";
    const r = await app.inject({ method: "PUT", url: "/admin/payment-methods", headers: bearer(app, "u-admin", "t1"), payload: { stripe: { enabled: true, secretKey: secret, webhookSecret: "whsec_ZZZZ9999", prices: { STARTER: "price_abc" } }, manual: [{ type: "bank_transfer", label: "Bank", instructions: "IBAN …" }] } });
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toContain(secret);
    expect(r.json().stripe).toMatchObject({ enabled: true, secretSet: true, secretHint: "…7890" });
    const saved = JSON.stringify(db.platformSetting.upsert.mock.calls[0][0]);
    expect(saved).not.toContain(secret);
    expect(saved).toContain("secretKeyEnc");
  });
  it("rejects malformed Stripe keys", async () => {
    asFirstUser();
    const app = await buildApp((a) => a.register(adminRoutes));
    const r = await app.inject({ method: "PUT", url: "/admin/payment-methods", headers: bearer(app, "u-admin", "t1"), payload: { stripe: { enabled: true, secretKey: "not-a-key" } } });
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    expect(db.platformSetting.upsert).not.toHaveBeenCalled();
  });
  it("refuses to save secrets without a real ENCRYPTION_KEY", async () => {
    asFirstUser(); process.env.ENCRYPTION_KEY = "";
    const app = await buildApp((a) => a.register(adminRoutes));
    const r = await app.inject({ method: "PUT", url: "/admin/payment-methods", headers: bearer(app, "u-admin", "t1"), payload: { stripe: { enabled: true, secretKey: "sk_test_ABCDEF1234567890" } } });
    expect(r.statusCode).toBe(400);
  });
  it("customers see manual instructions but no secrets", async () => {
    db.platformSetting.findUnique.mockResolvedValue({ value: { stripe: { enabled: true, secretKeyEnc: "x.y.z", secretHint: "…1" }, manual: [{ id: "m1", type: "bank_transfer", label: "Bank", instructions: "IBAN 123", enabled: true }, { id: "m2", type: "cash", label: "Hidden", instructions: "", enabled: false }] } });
    const app = await buildApp((a) => a.register(billingRoutes));
    const r = await app.inject({ method: "GET", url: "/billing/methods", headers: bearer(app, "u-regular", "t1") });
    expect(r.statusCode).toBe(200);
    expect(r.json().manual).toHaveLength(1);
    expect(r.body).not.toMatch(/secretKeyEnc|x\.y\.z/);
  });
});
