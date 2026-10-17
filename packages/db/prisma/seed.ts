import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";
const hashPw = (pw: string) => { const salt = randomBytes(16); return `scrypt$16384$8$1$${salt.toString("base64")}$${scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString("base64")}`; };
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
      passwordHash: hashPw("demo1234"),
      memberships: { create: { tenantId: tenant.id, role: "OWNER" } },
    },
  });
  const business = await prisma.business.create({
    data: {
      tenantId: tenant.id,
      name: "Acme Software Studio",
      description: "Demo business: custom software and automation for growing companies",
      services: ["Web development", "Mobile apps", "Automation", "Custom software"],
      industriesServed: ["Retail", "Logistics", "Healthcare", "Professional services"],
      targetCountries: ["SA", "AE", "QA", "KW", "OM", "BH"],
      targetCities: ["Riyadh", "Dubai", "Doha"],
      keywords: ["business automation", "custom software", "erp"],
      negativeKeywords: ["free template", "student project"],
      decisionMakerTitles: ["Owner", "Managing Director", "IT Manager", "Operations Manager"],
      languages: ["en", "ar"],
    },
  });
  await prisma.campaign.create({
    data: {
      businessId: business.id,
      name: "Demo outreach",
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

