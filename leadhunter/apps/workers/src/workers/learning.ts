import { Job } from "bullmq";
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

    const opens: { hour: number; opens: bigint }[] = await prisma.$queryRaw`
      SELECT EXTRACT(HOUR FROM "sentAt")::int AS hour, COUNT(*) AS opens
      FROM "Message" m JOIN "Lead" l ON l.id = m."leadId"
      WHERE l."businessId" = ${businessId} AND m."openedAt" IS NOT NULL AND m."sentAt" IS NOT NULL
      GROUP BY 1 ORDER BY opens DESC LIMIT 3`;

    const upsert = (kind: string, data: unknown) =>
      prisma.insight.create({ data: { businessId, kind, data: data as any } });
    if (won.length) await upsert("best_industry", won);
    if (geo.length) await upsert("best_geo", geo);
    if (opens.length) await upsert("best_send_time", opens.map((o) => ({ hour: o.hour, opens: Number(o.opens) })));
  }
  console.log("learning: insights recomputed");
}
