import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "Demo Tenant", slug: "demo", plan: "TRIAL" },
  });
  const user = await prisma.user.upsert({
    where: { email: "owner@demo.test" },
    update: {},
    create: {
      email: "owner@demo.test",
      name: "Demo Owner",
      passwordHash: createHash("sha256").update("demo1234").digest("hex"),
      memberships: { create: { tenantId: tenant.id, role: "OWNER" } },
    },
  });
  const business = await prisma.business.create({
    data: {
      tenantId: tenant.id,
      name: "Spark-ED School Management System",
      description: "K-12 school management & LMS for GCC international schools",
      services: ["School ERP", "LMS", "Parent App", "Fee Management"],
      industriesServed: ["Private Schools", "International Schools", "Universities", "Training Centers", "Kindergartens"],
      targetCountries: ["SA", "AE", "QA", "KW", "OM", "BH", "PK"],
      targetCities: ["Jeddah", "Riyadh", "Dubai", "Doha"],
      keywords: ["international school", "private school", "school management"],
      negativeKeywords: ["driving school", "cooking school"],
      decisionMakerTitles: ["Owner", "Principal", "Vice Principal", "School Director", "IT Manager", "Operations Manager", "Academic Director"],
      languages: ["en", "ar"],
    },
  });
  await prisma.campaign.create({
    data: {
      businessId: business.id,
      name: "GCC Schools Q3",
      channels: ["EMAIL", "WHATSAPP"],
      sources: ["places", "google_search", "directories"],
    },
  });

  // Register every department as an AI employee for the demo business.
  const { AGENT_REGISTRY } = await import("@leadhunter/agents/src/registry");
  for (const [role, def] of Object.entries(AGENT_REGISTRY) as [string, any][]) {
    await prisma.agent.upsert({
      where: { businessId_role: { businessId: business.id, role } },
      update: {}, create: { businessId: business.id, role, displayName: def.displayName },
    });
  }
  console.log("Registered", Object.keys(AGENT_REGISTRY).length, "AI department agents.");
  console.log("Seeded:", { tenant: tenant.slug, user: user.email, business: business.name });
}
main().finally(() => prisma.$disconnect());

