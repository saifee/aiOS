import { describe, it, expect, vi, beforeEach } from "vitest";
import { db as typed, buildApp, bearer } from "./helpers";
const db: any = typed;

vi.mock("@leadhunter/db", async () => { const { db: d } = await import("./dbmock"); return { prisma: d, arr: (v: any) => v ?? [], findLeadByListValue: vi.fn() }; });
const sendEmail = vi.fn().mockResolvedValue({});
vi.mock("@leadhunter/integrations", () => ({ sendEmail: (...a: any[]) => sendEmail(...a), PLANS: { FREE: {}, STARTER: {} }, EMAIL_PROVIDERS: ["smtp", "resend"] }));
vi.mock("@leadhunter/agents", () => ({ invalidatePlan: vi.fn(), loadEmailSetting: vi.fn().mockResolvedValue(null), saveEmailSetting: vi.fn(), emailAdminView: vi.fn(), emailRuntime: vi.fn().mockResolvedValue({ fromEmail: "hi@acme.com" }) }));

import { adminRoutes } from "../routes/admin";
import { inviteRoutes } from "../routes/invite";
import { hashToken, newInviteToken, validTokenShape } from "../lib/invites";
import { clearMembershipCache } from "../plugins/tenant";

beforeEach(() => {
  vi.clearAllMocks(); clearMembershipCache(); process.env.NODE_ENV = "test"; process.env.SUPERADMIN_EMAILS = "boss@acme.com"; process.env.APP_URL = "https://app.example.com";
  db.invite = { create: vi.fn(async ({ data }: any) => ({ id: "i1", ...data })), findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn(), findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() };
  db.membership.findFirst.mockResolvedValue({ role: "OWNER", tenantId: "t1" }); db.membership.upsert = vi.fn(); db.membership.create = vi.fn();
  db.user.findUnique.mockImplementation(async ({ where }: any) => (where.id === "u1" || where.email === "boss@acme.com") ? { id: "u1", email: "boss@acme.com", name: "Boss" } : null);
  db.tenant.findUnique.mockResolvedValue({ id: "t1", name: "Acme" }); db.auditLog.create.mockResolvedValue({});
});

describe("invite tokens", () => {
  it("are long, random, URL-safe and stored only as a hash", () => {
    const t = newInviteToken(); expect(validTokenShape(t)).toBe(true); expect(hashToken(t)).not.toContain(t); expect(newInviteToken()).not.toBe(t);
    expect(validTokenShape("short")).toBe(false); expect(validTokenShape("../../etc/passwd")).toBe(false);
  });
});

describe("admin invitations", () => {
  it("only a superadmin can invite", async () => {
    process.env.SUPERADMIN_EMAILS = "someone-else@acme.com";
    const app = await buildApp((a) => a.register(adminRoutes));
    const r = await app.inject({ method: "POST", url: "/admin/invites", headers: bearer(app, "u1", "t1"), payload: { email: "x@y.com", workspace: "New Co" } });
    expect(r.statusCode).toBe(403); expect(db.invite.create).not.toHaveBeenCalled();
  });
  it("creates an invite, emails a join link, never stores the raw token", async () => {
    const app = await buildApp((a) => a.register(adminRoutes));
    const r = await app.inject({ method: "POST", url: "/admin/invites", headers: bearer(app, "u1", "t1"), payload: { email: "New@Y.com", workspace: "New Co" } });
    expect(r.statusCode).toBe(201);
    const j = r.json(); expect(j.emailSent).toBe(true); expect(j.link).toMatch(/^https:\/\/app\.example\.com\/join\?t=[\w-]{40,}$/);
    const token = j.link.split("t=")[1];
    expect(db.invite.create.mock.calls[0][0].data.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(db.invite.create.mock.calls[0][0])).not.toContain(token);
    expect(db.invite.create.mock.calls[0][0].data.email).toBe("new@y.com");
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: "new@y.com", system: true });
  });
  it("still returns the link when email can't be sent", async () => {
    sendEmail.mockRejectedValueOnce(new Error("SMTP down"));
    const app = await buildApp((a) => a.register(adminRoutes));
    const r = await app.inject({ method: "POST", url: "/admin/invites", headers: bearer(app, "u1", "t1"), payload: { email: "a@b.com", tenantId: "t1", role: "ADMIN" } });
    expect(r.json()).toMatchObject({ emailSent: false, emailError: "SMTP down" }); expect(r.json().link).toContain("/join?t=");
  });
  it("rejects both/neither of workspace and tenantId, and the OWNER role", async () => {
    const app = await buildApp((a) => a.register(adminRoutes));
    for (const payload of [{ email: "a@b.com" }, { email: "a@b.com", tenantId: "t1", workspace: "x" }, { email: "a@b.com", tenantId: "t1", role: "OWNER" }])
      expect((await app.inject({ method: "POST", url: "/admin/invites", headers: bearer(app, "u1", "t1"), payload })).statusCode).toBe(400);
  });
});

describe("accepting an invitation", () => {
  const tok = newInviteToken();
  const inv = (o: any = {}) => ({ id: "i1", email: "new@y.com", tenantId: null, workspace: "New Co", role: "MEMBER", expiresAt: new Date(Date.now() + 86400_000), acceptedAt: null, ...o });
  const build = () => buildApp((a) => a.register(inviteRoutes));

  it("shows who the invite is for", async () => {
    db.invite.findUnique.mockResolvedValue(inv());
    const r = await (await build()).inject({ method: "GET", url: `/public/invite/${tok}` });
    expect(r.statusCode).toBe(200); expect(r.json()).toMatchObject({ email: "new@y.com", workspace: "New Co", accountExists: false });
    expect(db.invite.findUnique).toHaveBeenCalledWith({ where: { tokenHash: hashToken(tok) } });
  });
  it("rejects used, expired and unknown links with the same message", async () => {
    const app = await build();
    for (const v of [null, inv({ acceptedAt: new Date() }), inv({ expiresAt: new Date(Date.now() - 1000) })]) {
      db.invite.findUnique.mockResolvedValue(v);
      const r = await app.inject({ method: "GET", url: `/public/invite/${tok}` }); expect(r.statusCode).toBe(404);
    }
    expect((await app.inject({ method: "GET", url: "/public/invite/short" })).statusCode).toBe(404);
  });
  it("creates the account and a new workspace for a new person, and claims the link first", async () => {
    db.invite.findUnique.mockResolvedValue(inv());
    db.user.create.mockResolvedValue({ id: "u9", email: "new@y.com", name: "Nia", memberships: [{ tenantId: "t9", role: "OWNER" }] });
    const r = await (await build()).inject({ method: "POST", url: "/auth/invite/accept", payload: { token: tok, name: "Nia", password: "Vq7!rm29xLw0" } });
    expect(r.statusCode).toBe(201); expect(r.json().token).toBeTruthy();
    expect(db.invite.updateMany).toHaveBeenCalled();
    const data = db.user.create.mock.calls[0][0].data; expect(data.email).toBe("new@y.com"); expect(data.passwordHash).not.toContain("Vq7");
  });
  it("a replayed link is refused when the atomic claim fails", async () => {
    db.invite.findUnique.mockResolvedValue(inv()); db.invite.updateMany.mockResolvedValue({ count: 0 });
    const r = await (await build()).inject({ method: "POST", url: "/auth/invite/accept", payload: { token: tok, name: "Nia", password: "Vq7!rm29xLw0" } });
    expect(r.statusCode).toBe(404); expect(db.user.create).not.toHaveBeenCalled();
  });
  it("refuses weak passwords and does not burn the link", async () => {
    db.invite.findUnique.mockResolvedValue(inv());
    const r = await (await build()).inject({ method: "POST", url: "/auth/invite/accept", payload: { token: tok, name: "Nia", password: "qwerty123456" } });
    expect(r.statusCode).toBe(400); expect(db.invite.updateMany).not.toHaveBeenCalled();
  });
  it("an existing account must be signed in as the invited email", async () => {
    db.invite.findUnique.mockResolvedValue(inv({ email: "boss@acme.com", tenantId: "t1", workspace: null }));
    const app = await build();
    const anon = await app.inject({ method: "POST", url: "/auth/invite/accept", payload: { token: tok } });
    expect(anon.statusCode).toBe(401); expect(db.membership.upsert).not.toHaveBeenCalled();
  });
});
