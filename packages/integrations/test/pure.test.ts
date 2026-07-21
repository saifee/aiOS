import { describe, it, expect } from "vitest";
import { buildQueries } from "../src/discovery";
import { PLANS } from "../src/billing";

describe("buildQueries (lead discovery)", () => {
  const biz = { keywords: ["international school", "private school"], targetCities: ["Jeddah", "Riyadh"], targetCountries: ["SA"], industriesServed: ["Private Schools"] };

  it("produces geo-scoped queries for the default source", () => {
    const q = buildQueries(biz, "places");
    expect(q.length).toBeGreaterThan(0);
    expect(q[0].query).toContain("Jeddah");
  });

  it("uses source-specific query shapes", () => {
    expect(buildQueries(biz, "tenders").some((q) => /tender|RFP|procurement/i.test(q.query))).toBe(true);
    expect(buildQueries(biz, "jobs").some((q) => /hiring/i.test(q.query))).toBe(true);
    expect(buildQueries(biz, "news").some((q) => /expansion|funding|launch/i.test(q.query))).toBe(true);
  });

  it("caps keyword × geo expansion to keep API usage bounded", () => {
    const many = { ...biz, keywords: Array.from({ length: 20 }, (_, i) => `kw${i}`), targetCities: Array.from({ length: 20 }, (_, i) => `city${i}`) };
    // max 5 keywords × 6 geos
    expect(buildQueries(many, "places").length).toBeLessThanOrEqual(30);
  });
});

describe("PLANS (billing limits)", () => {
  it("every plan defines all limit keys", () => {
    for (const p of Object.values(PLANS))
      for (const k of ["leads", "outreach", "calls", "seats", "agents"])
        expect(p.limits).toHaveProperty(k);
  });

  it("limits increase with tier", () => {
    expect(PLANS.STARTER.limits.leads).toBeLessThan(PLANS.GROWTH.limits.leads);
    expect(PLANS.GROWTH.limits.leads).toBeLessThan(PLANS.SCALE.limits.leads);
    expect(PLANS.TRIAL.limits.leads).toBeLessThan(PLANS.STARTER.limits.leads);
  });

  it("trial is free, paid tiers are priced", () => {
    expect(PLANS.TRIAL.priceMonthly).toBe(0);
    expect(PLANS.STARTER.priceMonthly).toBeGreaterThan(0);
  });
});
