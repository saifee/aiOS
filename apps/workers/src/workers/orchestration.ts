import { Job } from "bullmq";
import { handleEvent, handleAgentMessage } from "@leadhunter/agents";

/** Consumes domain events + inter-agent messages and wakes the right agents. */
export async function orchestrationProcessor(job: Job) {
  if (job.name === "agent_message") {
    const { businessId, ...msg } = job.data;
    return handleAgentMessage(businessId, msg);
  }
  const { businessId, type, payload } = job.data;
  return handleEvent(businessId, type, payload);
}
