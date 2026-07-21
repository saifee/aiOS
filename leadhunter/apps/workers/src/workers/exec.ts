import { Job } from "bullmq";
import { prisma } from "@leadhunter/db";
import { runAgent } from "@leadhunter/agents";

/** Morning brief (executive reporting) + daily growth scan — one per business. */
export async function execProcessor(job: Job) {
  const businesses = await prisma.business.findMany({ select: { id: true } });
  for (const { id } of businesses) {
    if (job.name === "morning-brief") await runAgent({ businessId: id, role: "executive_reporting", input: { task: "Compile the morning brief; notify the owner with the 3 items that matter most." }, trigger: "schedule" }).catch(() => {});
    if (job.name === "growth-scan") await runAgent({ businessId: id, role: "growth", input: { task: "Daily growth scan: find new opportunities (schools/companies needing our services, tenders, competitor moves) and report the top ones." }, trigger: "schedule" }).catch(() => {});
  }
}
