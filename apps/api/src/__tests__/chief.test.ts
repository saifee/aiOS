import { describe, it, expect, vi, beforeEach } from "vitest";
import { db as typed } from "./helpers";
const db: any = typed;
const sent = vi.fn().mockResolvedValue({});

vi.mock("@leadhunter/db", async () => { const { db: d } = await import("./dbmock"); return { prisma: d, arr: (v: any) => v ?? [], findLeadByListValue: vi.fn() }; });
vi.mock("@leadhunter/integrations", () => ({ sendEmail: (...a: any[]) => sent(...a) }));

import { briefingHtml, buildBriefing, runDailyBriefings } from "../lib/chief";

beforeEach(() => {
  vi.clearAllMocks();
  db.business.findUnique.mockResolvedValue({ id: "b1", tenantId: "t1", name: "Acme <Co>", timezone: "Asia/Riyadh", branding: null });
  for (const m of ["lead", "message", "conversation", "approval", "invoice", "project", "agentRun", "task", "booking"]) db[m] ??= {};
  Object.assign(db.lead, { count: vi.fn().mockResolvedValue(3) });
  Object.assign(db.message, { count: vi.fn().mockResolvedValue(1) });
  Object.assign(db.conversation, { count: vi.fn().mockResolvedValue(0) });
  Object.assign(db.approval, { findMany: vi.fn().mockResolvedValue([{ id: "a1", summary: "Send proposal" }]) });
  Object.assign(db.invoice, { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }) });
  Object.assign(db.project, { count: vi.fn().mockResolvedValue(0) });
  Object.assign(db.agentRun, { count: vi.fn().mockResolvedValue(0) });
  Object.assign(db.task, { count: vi.fn().mockResolvedValue(2) });
  Object.assign(db.booking, { findMany: vi.fn().mockResolvedValue([{ startsAt: new Date(Date.now() + 3600_000), typeTitle: "Intro call", name: "Ann" }]) });
});

describe("Chief of Staff briefing", () => {
  it("summarises leads, approvals, tasks and meetings", async () => {
    const b = await buildBriefing("b1");
    expect(b.stats).toMatchObject({ newLeads: 3, approvals: 1, overdueTasks: 2 });
    expect(b.attention.join(" ")).toMatch(/approval/); expect(b.text).toMatch(/Intro call/);
  });
  it("keeps working when one data source fails", async () => {
    db.task.count = vi.fn().mockRejectedValue(new Error("no table"));
    expect((await buildBriefing("b1")).stats.overdueTasks).toBe(0);
  });
  it("escapes company names in the email", async () => {
    expect(briefingHtml("Saif", [await buildBriefing("b1")])).toContain("Acme &lt;Co&gt;");
  });
});

describe("daily email schedule", () => {
  const user = { id: "u1", email: "me@x.test", name: "Saif K", memberships: [{ tenantId: "t1" }] };
  beforeEach(() => { db.userPref ??= {}; db.userPref.update = vi.fn(); db.user.findUnique.mockResolvedValue(user); db.business.findMany = vi.fn().mockResolvedValue([{ id: "b1" }]); });
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());
  it("sends once for an opted-in user after their hour", async () => {
    db.userPref.findMany = vi.fn().mockResolvedValue([{ id: "p1", userId: "u1", value: { email: true, hour: 0, tz: "UTC" } }]);
    expect(await runDailyBriefings()).toBe(1); expect(sent).toHaveBeenCalledTimes(1);
  });
  it("does not resend the same day, and skips opted-out users", async () => {
    db.userPref.findMany = vi.fn().mockResolvedValue([{ id: "p1", userId: "u1", value: { email: true, hour: 0, tz: "UTC", lastSent: today() } }, { id: "p2", userId: "u2", value: { email: false, hour: 0, tz: "UTC" } }]);
    expect(await runDailyBriefings()).toBe(0); expect(sent).not.toHaveBeenCalled();
  });
});
