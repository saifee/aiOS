import { Job } from "bullmq";
import { runAgent } from "@leadhunter/agents";

/** Executes a queued agent "shift". */
export async function agentRunProcessor(job: Job) {
  const { businessId, role, input, trigger } = job.data;
  return runAgent({ businessId, role, input, trigger });
}
