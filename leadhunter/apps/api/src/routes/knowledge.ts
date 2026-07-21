import { FastifyInstance } from "fastify";
import { z } from "zod";
import { searchKnowledge, ingestKnowledge } from "@leadhunter/agents";

export async function knowledgeRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));

  app.post("/businesses/:businessId/knowledge/search", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    const { query, limit } = z.object({ query: z.string(), limit: z.number().max(12).default(6) }).parse(req.body);
    return searchKnowledge(businessId, query, limit);
  });

  app.post("/businesses/:businessId/knowledge/ingest", async (req) => {
    const { businessId } = req.params as any;
    await app.requireBusiness(req, businessId);
    const b = z.object({ source: z.string(), content: z.string(), title: z.string().optional(), sourceId: z.string().optional() }).parse(req.body);
    await ingestKnowledge(businessId, b.source, b.content, { title: b.title, sourceId: b.sourceId });
    return { ingested: true };
  });
}
