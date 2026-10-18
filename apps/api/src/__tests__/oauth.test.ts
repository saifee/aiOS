import { describe, it, expect, vi, beforeEach } from "vitest";
import { db as typed } from "./helpers";
const db: any = typed;

vi.mock("@leadhunter/db", async () => { const { db: d } = await import("./dbmock"); return { prisma: d, arr: (v: any) => v ?? [], findLeadByListValue: vi.fn() }; });

import { CONSUMERS_TENANT, profileFromIdToken, readState, signState } from "../lib/oauth";
import { resolveUser } from "../routes/oauth";

const idt = (c: any) => `x.${Buffer.from(JSON.stringify(c)).toString("base64url")}.y`;
const base = { aud: "cid", nonce: "n1", exp: Math.floor(Date.now() / 1000) + 600, sub: "s1", email: "A@Example.com", name: "Ann" };
const o = { clientId: "cid", nonce: "n1" };

describe("sign-in state", () => {
  it("round-trips and rejects tampering", () => {
    const s = signState("secret", { p: "google", n: "abc" });
    expect(readState("secret", s)?.n).toBe("abc");
    expect(readState("other", s)).toBeNull();
    expect(readState("secret", s.replace(/.$/, "A"))).toBeNull();
  });
});

describe("id_token checks", () => {
  const g = { ...base, iss: "https://accounts.google.com", email_verified: true };
  it("accepts a verified Google token and lowercases the email", () => expect(profileFromIdToken("google", idt(g), o)).toMatchObject({ email: "a@example.com", verified: true }));
  it("rejects wrong audience, nonce, expiry and issuer", () => {
    expect(() => profileFromIdToken("google", idt({ ...g, aud: "x" }), o)).toThrow();
    expect(() => profileFromIdToken("google", idt({ ...g, nonce: "z" }), o)).toThrow();
    expect(() => profileFromIdToken("google", idt({ ...g, exp: 1 }), o)).toThrow();
    expect(() => profileFromIdToken("google", idt({ ...g, iss: "https://evil.test" }), o)).toThrow();
  });
  it("treats work-account Microsoft emails as unverified, personal ones as verified", () => {
    const m = { ...base, iss: "https://login.microsoftonline.com/t/v2.0" };
    expect(profileFromIdToken("microsoft", idt({ ...m, tid: "corp" }), o).verified).toBe(false);
    expect(profileFromIdToken("microsoft", idt({ ...m, tid: CONSUMERS_TENANT }), o).verified).toBe(true);
  });
});

describe("account resolution", () => {
  const p = { subject: "s1", email: "a@example.com", name: "Ann", verified: true };
  const u = { id: "u1", memberships: [{ tenantId: "t1", role: "OWNER" }] };
  beforeEach(() => { vi.clearAllMocks(); db.oAuthIdentity ??= { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() }; db.oAuthIdentity.findUnique.mockResolvedValue(null); db.oAuthIdentity.findMany.mockResolvedValue([]); db.user.findUnique.mockResolvedValue(null); });
  it("creates a workspace for a new user", async () => {
    db.user.create.mockResolvedValue(u);
    await resolveUser("google", p);
    expect(db.user.create.mock.calls[0][0].data.memberships.create.role).toBe("OWNER");
  });
  it("links a verified identity to an existing account", async () => {
    db.user.findUnique.mockResolvedValue(u);
    await resolveUser("google", p);
    expect(db.oAuthIdentity.create).toHaveBeenCalled();
  });
  it("never links an unverified email to an existing account", async () => {
    db.user.findUnique.mockResolvedValue(u);
    await expect(resolveUser("microsoft", { ...p, verified: false })).rejects.toThrow(/already registered/);
    expect(db.oAuthIdentity.create).not.toHaveBeenCalled();
  });
  it("refuses to attach to an account that has an unverified sign-in", async () => {
    db.user.findUnique.mockResolvedValue(u);
    db.oAuthIdentity.findMany.mockResolvedValue([{ verified: false }]);
    await expect(resolveUser("google", p)).rejects.toThrow(/unverified/);
  });
});
