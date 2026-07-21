import { Job, Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@leadhunter/db";
import { findContactsByDomain, enrichCompany, fetchWebsiteText } from "@leadhunter/integrations";
import { ingestKnowledge } from "@leadhunter/agents";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null });
const qualification = new Queue("qualification", { connection });

/**
 * Enrichment: verified decision makers + company facts + website text.
 * Only stores provider-verified data — never fabricates contacts.
 */
export async function enrichmentProcessor(job: Job) {
  const lead = await prisma.lead.findUnique({ where: { id: job.data.leadId }, include: { business: true } });
  if (!lead || lead.optedOut) return;

  let confidence = 20; // has name + source
  const domain = lead.website ? new URL(lead.website).hostname.replace(/^www\./, "") : null;

  if (domain) {
    confidence += 20;
    const [contacts, company, siteText] = await Promise.all([
      findContactsByDomain(domain, lead.business.decisionMakerTitles).catch(() => []),
      enrichCompany(domain).catch(() => ({} as any)),
      fetchWebsiteText(lead.website!).catch(() => ""),
    ]);

    for (const [i, c] of contacts.slice(0, 3).entries()) {
      await prisma.contact.create({
        data: { leadId: lead.id, name: c.name, title: c.title, email: c.email, linkedin: c.linkedin, verified: c.verified, sourceUrl: c.sourceUrl, isPrimary: i === 0 },
      });
    }
    if (contacts.some((c) => c.verified)) confidence += 30;
    else if (contacts.length) confidence += 15;

    const emails = contacts.map((c) => c.email).filter(Boolean) as string[];
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        emails: [...new Set([...lead.emails, ...emails])],
        employeeCount: company.employeeCount ?? lead.employeeCount,
        techStack: company.techStack ?? lead.techStack,
        industry: company.industry ?? lead.industry,
        confidenceScore: Math.min(confidence + (company.employeeCount ? 10 : 0), 100),
        latestNews: siteText ? { websiteExcerpt: siteText.slice(0, 4000) } : undefined,
      },
    });
  } else {
    await prisma.lead.update({ where: { id: lead.id }, data: { confidenceScore: confidence } });
  }

  await prisma.activity.create({ data: { leadId: lead.id, type: "enriched" } });
  await ingestKnowledge(lead.businessId, "lead", `${lead.companyName} — ${lead.industry ?? ""} in ${lead.city ?? ""} ${lead.country ?? ""}. ${(lead.latestNews as any)?.websiteExcerpt ?? ""}`, { title: lead.companyName, sourceId: lead.id }).catch(() => {});
  await qualification.add("qualify", { leadId: lead.id }, { removeOnComplete: true });
}
