import { Job, Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@leadhunter/db";
import { ai } from "../ai";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null });
const outreach = new Queue("outreach", { connection });

/**
 * AI qualification: hybrid deterministic + LLM scoring.
 * Leads at/above business.minLeadScore move to QUALIFIED and enter outreach.
 */
export async function qualificationProcessor(job: Job) {
  const lead = await prisma.lead.findUnique({ where: { id: job.data.leadId }, include: { business: true, contacts: true } });
  if (!lead || lead.optedOut) return;

  const result = await ai.scoreLead({
    business: {
      description: lead.business.description, services: lead.business.services,
      industries: lead.business.industriesServed,
      sizeMin: lead.business.idealCompanySizeMin, sizeMax: lead.business.idealCompanySizeMax,
    },
    lead: {
      companyName: lead.companyName, industry: lead.industry, city: lead.city, country: lead.country,
      employeeCount: lead.employeeCount, techStack: lead.techStack,
      websiteExcerpt: (lead.latestNews as any)?.websiteExcerpt ?? "",
      hasVerifiedContact: lead.contacts.some((c) => c.verified),
      growthSignals: lead.growthSignals, source: lead.source,
      createdDaysAgo: Math.floor((Date.now() - lead.createdAt.getTime()) / 86400000),
    },
  });

  const qualified = result.score >= lead.business.minLeadScore && lead.contacts.length > 0;
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      leadScore: result.score, scoreBreakdown: result.breakdown,
      potentialNeed: result.potentialNeed, painPoints: result.painPoints,
      stage: qualified ? "QUALIFIED" : lead.stage,
    },
  });
  await prisma.activity.create({ data: { leadId: lead.id, type: "scored", detail: { score: result.score, qualified } } });

  if (qualified) await outreach.add("outreach", { leadId: lead.id }, { removeOnComplete: true });
}
