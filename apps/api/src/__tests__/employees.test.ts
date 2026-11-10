import { describe, it, expect, vi, beforeEach } from "vitest";

// A tiny in-memory database so the real runner, key lookup and AI call path are all exercised.
const { store, model } = vi.hoisted(() => {
const store: any = { tenant: "t0", runs: [] as any[], settings: [] as any[], keys: [] as any[], posts: [] as any[] };
const model = (o: any = {}) => new Proxy(o, { get: (t, k: string) => (k in t ? t[k] : k === "count" ? async () => 0 : k === "groupBy" ? async () => [] : async () => (k.startsWith("find") && k !== "findMany" ? null : [])) });
  return { store, model };
});
vi.mock("@leadhunter/db", () => ({
  prisma: {
    business: model({ findUnique: async () => ({ id: "b1", tenantId: store.tenant, name: "Acme Cleaning", tone: "friendly", timezone: "Asia/Riyadh", description: "Office cleaning", services: ["Office cleaning"], languages: ["en"] }), findMany: async () => [{ id: "b1", timezone: "Asia/Riyadh" }] }),
    employeeSetting: model({ findMany: async () => store.settings.filter((s: any) => s.enabled), findUnique: async ({ where }: any) => store.settings.find((s: any) => s.employee === where.businessId_employee.employee) ?? null }),
    employeeRun: model({
      findUnique: async ({ where }: any) => (where.id ? store.runs.find((r: any) => r.id === where.id) : store.runs.find((r: any) => r.routine === where.businessId_routine_periodKey.routine && r.periodKey === where.businessId_routine_periodKey.periodKey)) ?? null,
      create: async ({ data }: any) => { if (store.runs.some((r: any) => r.routine === data.routine && r.periodKey === data.periodKey)) throw Object.assign(new Error("Unique"), { code: "P2002" }); const r = { id: "r" + store.runs.length, state: "new", ...data }; store.runs.push(r); return r; },
      update: async ({ where, data }: any) => { const r = store.runs.find((x: any) => x.id === where.id); Object.assign(r, data); return r; },
      findMany: async () => [...store.runs].reverse(), findFirst: async () => null, count: async () => store.runs.length,
    }),
    aiKey: model({ findMany: async () => store.keys, update: async () => ({}) }),
    subscription: model({ findUnique: async () => ({ plan: "FREE" }) }),
    tenant: model({ findUnique: async () => ({ plan: "FREE" }) }),
    socialPost: model({ create: async ({ data }: any) => { const p = { id: "p" + store.posts.length, ...data }; store.posts.push(p); return p; } }),
  },
  arr: (v: any) => v ?? [],
}));
vi.mock("@leadhunter/integrations", async (orig) => ({ ...(await orig<any>()), assertPublicUrl: vi.fn(async (u: string) => new URL(u)) }));

import { runRoutine, runDueEmployees, dayMatches, isDue, periodKey, localParts, EMPLOYEES, ROUTINES } from "@leadhunter/agents";
import { encrypt } from "@leadhunter/integrations";

const at = (iso: string, tz = "UTC") => localParts(new Date(iso), tz);
beforeEach(() => {
  process.env.ENCRYPTION_KEY = "ab".repeat(32);
  store.tenant = "t" + Math.random().toString(36).slice(2); store.runs = []; store.settings = []; store.keys = []; store.posts = [];
  vi.restoreAllMocks();
});

describe("schedules", () => {
  it("matches weekday rules in the business's own time zone", () => {
    expect(dayMatches("mon-fri", at("2026-11-10T10:00:00Z"))).toBe(true);   // Tuesday
    expect(dayMatches("mon-fri", at("2026-11-14T10:00:00Z"))).toBe(false);  // Saturday
    expect(dayMatches("fri", at("2026-11-13T10:00:00Z"))).toBe(true);
    expect(dayMatches("tue-fri", at("2026-11-09T10:00:00Z"))).toBe(false);  // Monday
    // 22:30 UTC Sunday is already Monday morning in Riyadh (UTC+3)
    expect(dayMatches("mon", at("2026-11-08T22:30:00Z", "Asia/Riyadh"))).toBe(true);
  });
  it("finds the first and last weekday of a month", () => {
    expect(dayMatches("first-weekday", at("2026-11-02T10:00:00Z"))).toBe(true);   // Nov 1 is a Sunday
    expect(dayMatches("first-weekday", at("2026-11-03T10:00:00Z"))).toBe(false);
    expect(dayMatches("last-weekday", at("2026-11-30T10:00:00Z"))).toBe(true);    // Monday
    expect(dayMatches("last-weekday", at("2026-10-30T10:00:00Z"))).toBe(true);    // Oct 31 is a Saturday
  });
  it("uses one key per period", () => {
    const p = at("2026-11-10T10:00:00Z");
    expect(periodKey("day", p)).toBe("2026-11-10"); expect(periodKey("month", p)).toBe("2026-11"); expect(periodKey("week", p)).toBe("2026-W46");
  });
  it("is due from the fire hour for 5 more hours, not before", () => {
    const r = ROUTINES["gtm-signal-sweep"].routine;   // mon-fri 07:00
    expect(isDue(r, at("2026-11-10T06:00:00Z"))).toBe(false); expect(isDue(r, at("2026-11-10T07:05:00Z"))).toBe(true); expect(isDue(r, at("2026-11-10T13:00:00Z"))).toBe(false);
  });
  it("has 8 employees and unique routine ids", () => {
    expect(EMPLOYEES).toHaveLength(8); const ids = EMPLOYEES.flatMap((e) => e.routines.map((r) => r.id)); expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("running routines", () => {
  it("site health needs no AI key and flags what is missing", async () => {
    store.settings.push({ employee: "_all", enabled: false, config: { website: "example.com" } });
    vi.stubGlobal("fetch", vi.fn(async (u: string) => u.includes("robots") ? new Response("", { status: 404 }) : new Response("<html lang='en'><head><title>Acme</title></head><body><h1>Hi</h1></body></html>", { status: 200, headers: {} })));
    const r = await runRoutine("b1", "web-site-health", { trigger: "manual", now: new Date("2026-11-10T08:00:00Z") });
    expect(r.status).toBe("ok");
    const out = store.runs[0].output as string;
    expect(out).toContain("Status 200"); expect(out).toMatch(/Meta description: \*\*missing\*\*/); expect(out).toMatch(/robots.txt: \*\*not found\*\*/);
  });
  it("is blocked (not crashing) when no AI key exists, and says what to do", async () => {
    const r = await runRoutine("b1", "gtm-signal-sweep", { trigger: "manual", now: new Date("2026-11-10T08:00:00Z") });
    expect(r.status).toBe("blocked"); expect(store.runs[0].error).toMatch(/AI key|AI Keys/i);
  });
  it("uses the workspace's key in the background even when it was added by a person and not shared", async () => {
    store.keys.push({ id: "k1", userId: "u1", tenantId: store.tenant, provider: "groq", enabled: true, shared: false, keyEnc: encrypt("gsk_test_key_123456"), model: null, baseUrl: null, priority: 0 });
    const f = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "# Three leads worth a call\n- Acme\n\n## Needs you\n- Nothing" } }], usage: {} }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await runRoutine("b1", "gtm-signal-sweep", { trigger: "manual", now: new Date("2026-11-10T08:00:00Z") });
    expect(r.status).toBe("ok"); expect(store.runs[0].title).toBe("Three leads worth a call");
    const [url, init] = f.mock.calls[0] as any; expect(url).toContain("api.groq.com"); expect(init.headers.Authorization).toBe("Bearer gsk_test_key_123456");
    const body = JSON.parse(init.body); expect(body.messages[0].content).toMatch(/never send, post/i);   // guardrail is in every prompt
  });
  it("runs a period once: a second scheduled run is skipped", async () => {
    const now = new Date("2026-11-10T08:00:00Z");
    await runRoutine("b1", "cos-fleet-check", { trigger: "schedule", now });
    const again = await runRoutine("b1", "cos-fleet-check", { trigger: "schedule", now });
    expect(again.skipped).toBe(true); expect(store.runs).toHaveLength(1);
  });
  it("saves social posts only as unpublished drafts", async () => {
    store.keys.push({ id: "k1", userId: "u1", tenantId: store.tenant, provider: "groq", enabled: true, shared: true, keyEnc: encrypt("gsk_test_key_123456"), model: null, baseUrl: null, priority: 0 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ headline: "Week of posts", posts: [{ channel: "linkedin", content: "Hello" }, { channel: "myspace", content: "nope" }, { channel: "x", content: "Hi" }], needsYou: ["Review"] }) } }] }), { status: 200 })));
    const r = await runRoutine("b1", "social-week-plan", { trigger: "manual", now: new Date("2026-11-09T08:00:00Z") });
    expect(r.status).toBe("ok"); expect(store.posts.map((p: any) => p.channel)).toEqual(["linkedin", "x"]); expect(store.posts.every((p: any) => p.status === "draft")).toBe(true);
  });
  it("the scheduler runs only routines that are due, and at most the per-tick limit", async () => {
    store.settings.push({ employee: "cos", enabled: true, businessId: "b1", updatedAt: new Date() }, { employee: "webdev", enabled: true, businessId: "b1", updatedAt: new Date() });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<title>x</title>", { status: 200 })));
    const n = await runDueEmployees({ now: new Date("2026-11-10T04:30:00Z"), maxPerTick: 4 });   // 07:30 in Riyadh, a Tuesday
    expect(n).toBe(2); expect(store.runs.map((r: any) => r.routine).sort()).toEqual(["cos-fleet-check", "web-site-health"]);
    expect(await runDueEmployees({ now: new Date("2026-11-10T04:40:00Z") })).toBe(0);   // already done today
  });
});
