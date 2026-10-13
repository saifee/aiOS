import { Queue, Job } from "bullmq";
import IORedis from "ioredis";

/**
 * Job queue with two interchangeable backends:
 *  - Redis/BullMQ  (REDIS_URL set, LITE_MODE != true)  -> separate worker process
 *  - INLINE        (no Redis, e.g. Hostinger Cloud)     -> jobs run inside this Node process
 * Callers only use getQueue(name).add(jobName, data, opts) — same API either way.
 */
export const INLINE = process.env.LITE_MODE === "true" || !process.env.REDIS_URL;

type Processor = (job: Job) => Promise<unknown>;
const processors = new Map<string, Processor>();
const concurrency: Record<string, number> = { outreach: 3, "agent-run": 4, swarm: 2 };
const running = new Map<string, number>();
const waiting = new Map<string, Array<() => void>>();

export function registerProcessor(queue: string, fn: Processor) { processors.set(queue, fn); }
export function hasProcessor(queue: string) { return processors.has(queue); }

let _conn: IORedis | null = null;
export function redis(): IORedis {
  if (INLINE) throw new Error("Redis is not available in inline mode");
  return (_conn ??= new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null }));
}

async function runInline(queue: string, name: string, data: any) {
  const fn = processors.get(queue);
  if (!fn) { console.warn(`[inline] no processor registered for "${queue}" — job "${name}" skipped`); return; }
  const limit = concurrency[queue] ?? 5;
  if ((running.get(queue) ?? 0) >= limit) await new Promise<void>((res) => { (waiting.get(queue) ?? waiting.set(queue, []).get(queue)!).push(res); });
  running.set(queue, (running.get(queue) ?? 0) + 1);
  try {
    await fn({ name, data, id: `${queue}-${Date.now()}`, attemptsMade: 0 } as unknown as Job);
  } catch (e: any) {
    console.error(`[inline] ${queue}/${name} failed:`, e?.message ?? e);
  } finally {
    running.set(queue, (running.get(queue) ?? 1) - 1);
    waiting.get(queue)?.shift()?.();
  }
}

const cache = new Map<string, Queue>();
export function getQueue(name: string): Queue {
  if (cache.has(name)) return cache.get(name)!;
  const q = INLINE
    ? ({
        name,
        add: async (jobName: string, data: any, opts?: { delay?: number }) => {
          // Long delays (follow-ups: days) are NOT held in memory — a restart would lose them.
          // The follow-up "scan" job re-derives them from the database instead.
          if (opts?.delay && opts.delay > 60_000) return null;
          const go = () => { void runInline(name, jobName, data); };
          if (opts?.delay) setTimeout(go, opts.delay); else setImmediate(go);
          return null;
        },
      } as unknown as Queue)
    : new Queue(name, { connection: redis() });
  cache.set(name, q);
  return q;
}
