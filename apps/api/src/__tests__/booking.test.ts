import { describe, it, expect, vi, beforeEach } from "vitest";
import { db as typed, buildApp, bearer } from "./helpers";
const db: any = typed;

vi.mock("@leadhunter/db", async () => { const { db: d } = await import("./dbmock"); return { prisma: d, arr: (v: any) => v ?? [], findLeadByListValue: vi.fn() }; });
vi.mock("@leadhunter/integrations", () => ({ sendEmail: vi.fn().mockResolvedValue({}) }));

import { readConfig, slotsFor, toIcs, zonedToUtc } from "../lib/booking";
import { bookingRoutes } from "../routes/booking";
import { clearMembershipCache } from "../plugins/tenant";

const biz = (booking: any = {}) => ({ id: "b1", tenantId: "t1", name: "Acme", timezone: "Asia/Riyadh", branding: { booking: { enabled: true, slug: "acme-1", ...booking } } });

describe("time zones and slots", () => {
  it("converts Riyadh wall time (UTC+3) to UTC", () => expect(new Date(zonedToUtc("2030-01-06", "09:00", "Asia/Riyadh")).toISOString()).toBe("2030-01-06T06:00:00.000Z"));
  it("handles daylight saving (London summer = UTC+1)", () => expect(new Date(zonedToUtc("2030-07-01", "09:00", "Europe/London")).toISOString()).toBe("2030-07-01T08:00:00.000Z"));
  const cfg = readConfig(biz({ hours: { "1": [["09:00", "11:00"]] }, minNoticeHours: 0, daysAhead: 4000 }));
  const type = cfg.types[0]; // 30 min
  const now = Date.parse("2030-01-01T00:00:00Z");
  it("offers 30-minute slots inside open hours only", () => {
    const s = slotsFor(cfg, type, "2030-01-07", [], now); // a Monday
    expect(s).toHaveLength(4); expect(s[0]).toBe("2030-01-07T06:00:00.000Z");
    expect(slotsFor(cfg, type, "2030-01-08", [], now)).toHaveLength(0); // Tuesday closed
  });
  it("removes slots that overlap an existing booking", () => {
    const busy = [{ startsAt: new Date("2030-01-07T06:30:00Z"), endsAt: new Date("2030-01-07T07:00:00Z") }];
    expect(slotsFor(cfg, type, "2030-01-07", busy, now)).not.toContain("2030-01-07T06:30:00.000Z");
  });
  it("respects minimum notice", () => expect(slotsFor({ ...cfg, minNoticeHours: 24 }, type, "2030-01-07", [], Date.parse("2030-01-07T05:00:00Z")).length).toBeLessThan(4));
});

describe("calendar file", () => {
  it("produces a valid, escaped VCALENDAR", () => {
    const ics = toIcs("Acme", [{ uid: "1", start: new Date("2030-01-07T06:00:00Z"), end: new Date("2030-01-07T06:30:00Z"), title: "Call; with, Ann" }]);
    expect(ics).toContain("BEGIN:VCALENDAR"); expect(ics).toContain("DTSTART:20300107T060000Z"); expect(ics).toContain("SUMMARY:Call\; with\\, Ann");
  });
});

describe("booking API", () => {
  beforeEach(() => {
    vi.clearAllMocks(); clearMembershipCache(); process.env.NODE_ENV = "test";
    db.booking = { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() };
    db.business.findFirst.mockResolvedValue(biz({ hours: { "0": [["09:00", "17:00"]], "1": [["09:00", "17:00"]], "2": [["09:00", "17:00"]], "3": [["09:00", "17:00"]], "4": [["09:00", "17:00"]], "5": [["09:00", "17:00"]], "6": [["09:00", "17:00"]] }, minNoticeHours: 0, daysAhead: 60 }));
    db.membership.findMany = vi.fn().mockResolvedValue([]); db.notification.create = vi.fn();
    db.membership.findFirst.mockResolvedValue({ role: "OWNER", tenantId: "t1" });
  });
  const day = () => new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);

  it("shows public page details without private data", async () => {
    const app = await buildApp((a) => a.register(bookingRoutes));
    const r = await app.inject({ method: "GET", url: "/public/book/acme-1" });
    expect(r.statusCode).toBe(200); expect(JSON.stringify(r.json())).not.toMatch(/feedToken|notifyEmail|tenantId/);
  });
  it("404s when booking is switched off", async () => {
    db.business.findFirst.mockResolvedValue(biz({ enabled: false }));
    const app = await buildApp((a) => a.register(bookingRoutes));
    expect((await app.inject({ method: "GET", url: "/public/book/acme-1" })).statusCode).toBe(404);
  });
  it("creates a booking for a real slot and refuses a made-up time", async () => {
    const app = await buildApp((a) => a.register(bookingRoutes));
    const slots = (await app.inject({ method: "GET", url: `/public/book/acme-1/slots?type=intro&date=${day()}` })).json().slots as string[];
    expect(slots.length).toBeGreaterThan(0);
    db.booking.create.mockImplementation(async ({ data }: any) => ({ id: "k1", ...data }));
    const ok = await app.inject({ method: "POST", url: "/public/book/acme-1", payload: { type: "intro", startsAt: slots[0], name: "Ann", email: "ann@x.test" } });
    expect(ok.statusCode).toBe(201); expect(ok.json().icsUrl).toMatch(/\.ics$/);
    const bad = await app.inject({ method: "POST", url: "/public/book/acme-1", payload: { type: "intro", startsAt: "2030-01-01T01:07:00.000Z", name: "Ann", email: "ann@x.test" } });
    expect(bad.statusCode).toBe(409);
  });
  it("reports a double-booking race as 409", async () => {
    const app = await buildApp((a) => a.register(bookingRoutes));
    const slots = (await app.inject({ method: "GET", url: `/public/book/acme-1/slots?type=intro&date=${day()}` })).json().slots as string[];
    db.booking.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect((await app.inject({ method: "POST", url: "/public/book/acme-1", payload: { type: "intro", startsAt: slots[0], name: "Ann", email: "ann@x.test" } })).statusCode).toBe(409);
  });
  it("requires sign-in to manage settings and bookings", async () => {
    const app = await buildApp((a) => a.register(bookingRoutes));
    expect((await app.inject({ method: "GET", url: "/businesses/b1/bookings" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/businesses/b1/bookings.ics" })).statusCode).toBe(401);
  });
  it("rejects invalid availability", async () => {
    db.business.findFirst.mockResolvedValue({ id: "b1", tenantId: "t1" });
    db.business.findUnique.mockResolvedValue(biz());
    const app = await buildApp((a) => a.register(bookingRoutes));
    const r = await app.inject({ method: "PUT", url: "/businesses/b1/booking", headers: bearer(app, "u1", "t1"), payload: { enabled: true, title: "x", welcome: "", timezone: "Mars/Base", hours: {}, types: [{ id: "a", title: "A", minutes: 30 }], minNoticeHours: 1, daysAhead: 5, bufferMin: 0, preferExternal: false, notifyEmail: "", joinUrl: "" } });
    expect(r.statusCode).toBe(400);
  });
});
