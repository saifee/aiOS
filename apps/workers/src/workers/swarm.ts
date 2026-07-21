import { Job } from "bullmq";
import { runSwarm } from "@leadhunter/agents";
/** Executes a delegated build through the multi-model developer swarm. */
export async function swarmProcessor(job: Job) {
  const { businessId, task, repo } = job.data;
  return runSwarm({ businessId, task, repo });
}
