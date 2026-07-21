import { Job, Queue } from "bullmq";
import IORedis from "ioredis";
import { createHash } from "crypto";
import { prisma } from "@leadhunter/db";
import { discoverViaPlaces, discoverViaSearch, buildQueries, RawLead } from "@leadhunter/integrations";
import { consumeQuota } from "@leadhunter/agents";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null });
const enrichment = new Queue("enrichment", { connection });

/**
 * Discovery loop: for each active campaign, query configured sources,
 * normalize + dedupe, insert as FOUND, then queue enrichment.
 */
export async function discoveryProcessor(job: Job) {
  const campaigns = job.name === "discover-all"
    ? await prisma.campaign.findMany({ where: { status: "ACTIVE" }, include: { business: true } })
    : await prisma.campaign.findMany({ where: { id: job.data.campaignId }, include: { business: true } });

  for (const campaign of campaigns) {
    const b = campaign.business;
    const found: RawLead[] = [];

    for (const source of campaign.sources) {
      try {
        if (source === "places") {
          for (const kw of b.keywords.slice(0, 5))
            for (const city of b.targetCities.slice(0, 6))
              found.push(...await discoverViaPlaces(kw, city));
        } else {
          for (const q of buildQueries(b, source).slice(0, 12))
            found.push(...await discoverViaSearch(q.query, { city: q.city, country: q.country, source }));
        }
      } catch (e) { console.error(`discovery source=${source} campaign=${campaign.id}`, e); }
    }

    let inserted = 0;
    for (const raw of found) {
      if (b.negativeKeywords.some((n) => raw.companyName.toLowerCase().includes(n.toLowerCase()))) continue;
      const dedupeKey = raw.website
        ? new URL(raw.website).hostname.replace(/^www\./, "")
        : createHash("sha1").update(`${raw.companyName.toLowerCase()}|${raw.city ?? ""}`).digest("hex");
      const quota = await consumeQuota(b.tenantId, "leads");
      if (!quota.allowed) { console.log(`discovery: lead quota reached for tenant ${b.tenantId} (${quota.count}/${quota.limit}, plan ${quota.plan})`); break; }
      try {
        const lead = await prisma.lead.create({
          data: {
            businessId: b.id, campaignId: campaign.id, dedupeKey,
            companyName: raw.companyName, website: raw.website, industry: raw.industry,
            country: raw.country, city: raw.city, address: raw.address,
            phones: raw.phones ?? [], source: raw.source, sourceUrl: raw.sourceUrl,
          },
        });
        await prisma.activity.create({ data: { leadId: lead.id, type: "discovered", detail: { source: raw.source } } });
        await enrichment.add("enrich", { leadId: lead.id }, { removeOnComplete: true });
        inserted++;
      } catch { /* unique(businessId, dedupeKey) — already known */ }
    }
    console.log(`discovery campaign=${campaign.name} found=${found.length} new=${inserted}`);
  }
}
