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
  await prisma.memory.create({ data: { businessId, agentId: opts.agentId ?? null, kind: opts.kind ?? "episodic", content, embedding: vec ?? undefined } });
}

export async function ingestKnowledge(businessId: string, source: string, content: string, meta: { sourceId?: string; title?: string; metadata?: unknown } = {}) {
  if (!content?.trim()) return;
  const vec = await embed(content.slice(0, 8000)).catch(() => null);
  await prisma.knowledgeChunk.create({
    data: { businessId, source, sourceId: meta.sourceId ?? null, title: meta.title ?? null, content: content.slice(0, 8000), metadata: (meta.metadata ?? {}) as any, embedding: vec ?? undefined },
  });
}

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/**
 * Semantic search over the Knowledge Brain. MySQL has no vector type, so embeddings are stored as
 * JSON and cosine similarity is computed here over the business's most recent chunks (fine up to a
 * few thousand chunks; move to a vector DB when it outgrows that).
 */
export async function searchKnowledge(businessId: string, query: string, limit = 6): Promise<{ title: string; content: string; source: string; score: number }[]> {
  const vec = await embed(query).catch(() => null);
  if (!vec) {
    const rows = await prisma.knowledgeChunk.findMany({ where: { businessId, content: { contains: query } }, take: limit });
    return rows.map((r) => ({ title: r.title ?? "", content: r.content, source: r.source, score: 0 }));
  }
  const rows = await prisma.knowledgeChunk.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 3000 });
  return rows
    .filter((r) => Array.isArray(r.embedding))
    .map((r) => ({ title: r.title ?? "", content: r.content, source: r.source, score: cosine(vec, r.embedding as number[]) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}
