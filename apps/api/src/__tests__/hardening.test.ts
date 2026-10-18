import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db as typed, buildApp } from "./helpers";
const db: any = typed;

vi.mock("@leadhunter/db", async () => { const { db: d } = await import("./dbmock"); return { prisma: d, arr: (v: any) => v ?? [], findLeadByListValue: vi.fn() }; });

import { authRoutes } from "../routes/auth";
import { clearLockouts, lockedFor, recordFailure } from "../lib/lockout";
import { weakPassword } from "../lib/passwords";
import { captchaConfig, verifyCaptcha } from "../lib/captcha";
import { cspHeader } from "../lib/security";

const env = { ...process.env };
beforeEach(() => { vi.clearAllMocks(); clearLockouts(); process.env.NODE_ENV = "test"; delete process.env.CAPTCHA_PROVIDER; delete process.env.CAPTCHA_SITE_KEY; delete process.env.CAPTCHA_SECRET; db.user.findUnique.mockResolvedValue(null); });
afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

describe("brute-force lockout", () => {
  it("locks an email/IP pair after 5 failures but not the same email from another IP", () => {
    for (let i = 0; i < 5; i++) recordFailure("a@x.test", "1.1.1.1");
    expect(lockedFor("a@x.test", "1.1.1.1")).toBeGreaterThan(0);
    expect(lockedFor("a@x.test", "2.2.2.2")).toBe(0);
  });
  it("locks an email attacked from many IPs, and an IP spraying many emails", () => {
    for (let i = 0; i < 25; i++) recordFailure("b@x.test", `9.9.9.${i}`);
    expect(lockedFor("b@x.test", "5.5.5.5")).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) recordFailure(`u${i}@x.test`, "7.7.7.7");
    expect(lockedFor("fresh@x.test", "7.7.7.7")).toBeGreaterThan(0);
  });
  it("login returns 429 with Retry-After once locked, even for the right password", async () => {
    const app = await buildApp((a) => a.register(authRoutes));
    for (let i = 0; i < 5; i++) expect((await app.inject({ method: "POST", url: "/login", payload: { email: "v@x.test", password: "wrong-password" } })).statusCode).toBe(401);
    const r = await app.inject({ method: "POST", url: "/login", payload: { email: "v@x.test", password: "wrong-password" } });
    expect(r.statusCode).toBe(429); expect(Number(r.headers["retry-after"])).toBeGreaterThan(0);
  });
});

describe("captcha", () => {
  const on = (p = "turnstile") => { process.env.CAPTCHA_PROVIDER = p; process.env.CAPTCHA_SITE_KEY = "site"; process.env.CAPTCHA_SECRET = "secret"; process.env.APP_URL = "https://aios.example.com"; };
  it("is off until provider, site key and secret are all set", () => { process.env.CAPTCHA_PROVIDER = "turnstile"; expect(captchaConfig()).toBeNull(); on(); expect(captchaConfig()?.provider).toBe("turnstile"); });
  it("accepts a good token, rejects bad ones, a token for another site, and provider outages", async () => {
    on();
    const f = vi.fn().mockResolvedValue({ json: async () => ({ success: true, hostname: "aios.example.com" }) }); vi.stubGlobal("fetch", f);
    expect(await verifyCaptcha("x".repeat(30))).toBe(true);
    expect(f.mock.calls[0][0]).toContain("challenges.cloudflare.com");
    expect(await verifyCaptcha("")).toBe(false); expect(await verifyCaptcha(undefined)).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ success: true, hostname: "evil.test" }) }));
    expect(await verifyCaptcha("x".repeat(30))).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await verifyCaptcha("x".repeat(30))).toBe(false);
  });
  it("login and register refuse requests without a valid captcha when enabled", async () => {
    on(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ success: false }) }));
    const app = await buildApp((a) => a.register(authRoutes));
    const l = await app.inject({ method: "POST", url: "/login", payload: { email: "a@x.test", password: "whatever-pass", captcha: "bad".repeat(10) } });
    expect(l.statusCode).toBe(400); expect(l.json().captcha).toBe(true);
    const r = await app.inject({ method: "POST", url: "/register", payload: { email: "a@x.test", password: "Str0ng-and-long!", name: "Zed", tenantName: "Co" } });
    expect(r.statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/captcha" })).json()).toEqual({ provider: "turnstile", siteKey: "site" });
  });
  it("only opens the CSP for the provider in use", () => {
    expect(cspHeader()).not.toContain("challenges.cloudflare.com");
    on("recaptcha"); expect(cspHeader()).toContain("www.google.com"); expect(cspHeader()).not.toContain("cloudflare");
  });
});

describe("password policy", () => {
  it("rejects common, repetitive and personal passwords", () => {
    expect(weakPassword("password123")).toBeTruthy(); expect(weakPassword("aaaaaaaaaaaa")).toBeTruthy();
    expect(weakPassword("saifullah-2026", "saifullah@x.test")).toBeTruthy(); expect(weakPassword("Kingslee!Rimal#42", "a@x.test", "Saif")).toBeNull();
  });
  it("register rejects a weak password", async () => {
    const app = await buildApp((a) => a.register(authRoutes));
    const r = await app.inject({ method: "POST", url: "/register", payload: { email: "a@x.test", password: "password123", name: "Zed", tenantName: "Co" } });
    expect(r.statusCode).toBe(400);
  });
});
