import type { Job } from "bullmq";
import { prisma } from "@leadhunter/db";

/**
 * Nightly learning loop: mines outcomes to answer
 *  - which industries convert best
 *  - best send hour (by opens)
 *  - best geo, best titles
 * Results stored as Insights → shown on dashboard and used to bias
 * future qualification (score breakdown weighting).
 */
export async function learningProcessor(_job: Job) {
  const businesses = await prisma.business.findMany({ select: { id: true } });
  for (const { id: businessId } of businesses) {
    const won = await prisma.lead.groupBy({ by: ["industry"], where: { businessId, stage: { in: ["INTERESTED", "MEETING_SCHEDULED", "WON"] } }, _count: true, orderBy: { _count: { industry: "desc" } }, take: 5 });
    const geo = await prisma.lead.groupBy({ by: ["country"], where: { businessId, stage: { in: ["INTERESTED", "WON"] } }, _count: true, orderBy: { _count: { country: "desc" } }, take: 5 });

    // Best send hour (UTC) by opens — computed in app code so it is database-agnostic
    const openedMsgs = await prisma.message.findMany({
      where: { lead: { businessId }, openedAt: { not: null }, sentAt: { not: null } },
      select: { sentAt: true }, take: 5000, orderBy: { sentAt: "desc" },
    });
    const byHour = new Map<number, number>();
    for (const m of openedMsgs) { const h = m.sentAt!.getUTCHours(); byHour.set(h, (byHour.get(h) ?? 0) + 1); }
    const opens = [...byHour.entries()].map(([hour, n]) => ({ hour, opens: n })).sort((a, b) => b.opens - a.opens).slice(0, 3);

    const upsert = (kind: string, data: unknown) =>
      prisma.insight.create({ data: { businessId, kind, data: data as any } });
    if (won.length) await upsert("best_industry", won);
    if (geo.length) await upsert("best_geo", geo);
    if (opens.length) await upsert("best_send_time", opens);
  }
  console.log("learning: insights recomputed");
}
