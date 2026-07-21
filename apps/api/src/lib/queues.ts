import { Queue } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const queues = {
  discovery: new Queue("discovery", { connection }),
  enrichment: new Queue("enrichment", { connection }),
  qualification: new Queue("qualification", { connection }),
  outreach: new Queue("outreach", { connection }),
  followup: new Queue("followup", { connection }),
  conversation: new Queue("conversation", { connection }),
  notify: new Queue("notify", { connection }),
  learning: new Queue("learning", { connection }),
};
