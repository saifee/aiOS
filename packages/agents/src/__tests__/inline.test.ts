import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.LITE_MODE = "true"; delete process.env.REDIS_URL; delete process.env.AI_SERVICE_URL; });

describe("inline job queue (no Redis)", () => {
  it("runs a registered processor in-process", async () => {
    const { getQueue, registerProcessor, INLINE } = await import("../jobqueue");
    expect(INLINE).toBe(true);
    const seen: any[] = [];
    registerProcessor("t1", async (job: any) => { seen.push([job.name, job.data]); });
    await getQueue("t1").add("go", { a: 1 });
    await new Promise((r) => setTimeout(r, 30));
    expect(seen).toEqual([["go", { a: 1 }]]);
  });
  it("does not hold multi-day delays in memory (scan re-derives them)", async () => {
    const { getQueue, registerProcessor } = await import("../jobqueue");
    let n = 0;
    registerProcessor("t2", async () => { n++; });
    await getQueue("t2").add("later", {}, { delay: 3 * 86400_000 });
    await new Promise((r) => setTimeout(r, 30));
    expect(n).toBe(0);
  });
  it("a failing job never crashes the process", async () => {
    const { getQueue, registerProcessor } = await import("../jobqueue");
    registerProcessor("t3", async () => { throw new Error("boom"); });
    await getQueue("t3").add("x", {});
    await new Promise((r) => setTimeout(r, 30));
  });
  it("respects per-queue concurrency", async () => {
    const { getQueue, registerProcessor } = await import("../jobqueue");
    let active = 0, peak = 0;
    registerProcessor("outreach", async () => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 20)); active--; });
    for (let i = 0; i < 8; i++) await getQueue("outreach").add("o", {});
    await new Promise((r) => setTimeout(r, 150));
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe("in-process AI scoring (replaces the Python service)", () => {
  it("scores from rules alone when no website text (no network call)", async () => {
    const { ai } = await import("../aiservice");
    const r = await ai.scoreLead({
      business: { industries: ["schools"], sizeMin: 50, sizeMax: 500 },
      lead: { industry: "Private Schools", employeeCount: 120, hasVerifiedContact: true, createdDaysAgo: 2, growthSignals: { newBranch: true }, source: "places" },
    });
    expect(r.score).toBeGreaterThan(50);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.confidence).toBe(55);
    expect(r.breakdown.industry_match).toBe(20);
  });
});
