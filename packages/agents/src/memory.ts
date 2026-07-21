import { prisma } from "@leadhunter/db";
import { embed } from "@leadhunter/integrations";

/**
 * Shared memory + Knowledge Brain. Everything the agency produces (leads,
 * messages, calls, docs, invoices) is ingested as embedded chunks so any
 * agent can ask "what do we know about X" and get grounded context — even
 * about a client who last called 18 months ago.
 */
export async function remember(businessId: string, content: string, opts: { agentId?: string; kind?: string } = {}) {
  const vec = await embed(content).catch(() => null);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Memory" (id, "businessId", "agentId", kind, content, embedding, "createdAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, ${vec ? `$5::vector` : "NULL"}, now())`,
    businessId, opts.agentId ?? null, opts.kind ?? "episodic", content, ...(vec ? [toVec(vec)] : [])
  );
}

export async function ingestKnowledge(businessId: string, source: string, content: string, meta: { sourceId?: string; title?: string; metadata?: unknown } = {}) {
  if (!content?.trim()) return;
  const vec = await embed(content.slice(0, 8000)).catch(() => null);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "KnowledgeChunk" (id, "businessId", source, "sourceId", title, content, metadata, embedding, "createdAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, ${vec ? `$7::vector` : "NULL"}, now())`,
    businessId, source, meta.sourceId ?? null, meta.title ?? null, content.slice(0, 8000),
    JSON.stringify(meta.metadata ?? {}), ...(vec ? [toVec(vec)] : [])
  );
}

/** Cosine-similarity semantic search over the Knowledge Brain. */
export async function searchKnowledge(businessId: string, query: string, limit = 6): Promise<{ title: string; content: string; source: string; score: number }[]> {
  const vec = await embed(query).catch(() => null);
  if (!vec) {
    const rows = await prisma.knowledgeChunk.findMany({ where: { businessId, content: { contains: query, mode: "insensitive" } }, take: limit });
    return rows.map((r) => ({ title: r.title ?? "", content: r.content, source: r.source, score: 0 }));
  }
  return prisma.$queryRawUnsafe(
    `SELECT title, content, source, 1 - (embedding <=> $2::vector) AS score
     FROM "KnowledgeChunk"
     WHERE "businessId" = $1 AND embedding IS NOT NULL
     ORDER BY embedding <=> $2::vector ASC
     LIMIT $3`,
    businessId, toVec(vec), limit
  ) as any;
}

function toVec(arr: number[]) { return `[${arr.join(",")}]`; }
