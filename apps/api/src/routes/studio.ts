import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { z } from "zod";
import { runSwarm, runAgent } from "@leadhunter/agents";
import { getVideoStatus, publishToChannel, decrypt } from "@leadhunter/integrations";

/** Tier-3 Studio: developer swarm, creative generation, social publishing. */
export async function studioRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (req) => app.authenticate(req));

  // ── Dev swarm ──
  app.get("/businesses/:businessId/swarm/runs", async (req) => {
    const { businessId } = req.params as any; await app.requireBusiness(req, businessId);
    return prisma.swarmRun.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 30 });
  });
  app.get("/swarm/runs/:id", async (req) => {
    const { id } = req.params as any;
    const run = await prisma.swarmRun.findUnique({ where: { id } });
    if (!run) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await app.requireBusiness(req, run.businessId);
    return run;
  });
  app.post("/businesses/:businessId/swarm/run", async (req) => {
    const { businessId } = req.params as any; await app.requireBusiness(req, businessId);
    const { task, repo, context } = z.object({ task: z.string().min(3), repo: z.string().optional(), context: z.string().optional() }).parse(req.body);
    return runSwarm({ businessId, task, repo, context }); // synchronous run returns full result
  });

  // ── Creative ──
  app.get("/businesses/:businessId/media", async (req) => {
    const { businessId } = req.params as any; await app.requireBusiness(req, businessId);
    return prisma.mediaAsset.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 40 });
  });
  app.post("/businesses/:businessId/media/image", async (req) => {
    const { businessId } = req.params as any; await app.requireBusiness(req, businessId);
    const { prompt } = z.object({ prompt: z.string().min(3) }).parse(req.body);
    return runAgent({ businessId, role: "graphic_designer", input: { task: `Create this image and return the asset: ${prompt}` }, trigger: "manual" });
  });
  app.post("/media/:id/refresh", async (req) => { // poll a pending video
    const { id } = req.params as any;
    const asset = await prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await app.requireBusiness(req, asset.businessId);
    if (asset.kind === "video" && asset.providerRef && asset.status === "pending") {
      const s = await getVideoStatus(asset.providerRef).catch(() => null);
      if (s?.status === "completed" && s.url) return prisma.mediaAsset.update({ where: { id }, data: { status: "ready", url: s.url } });
    }
    return asset;
  });

  // ── Social ──
  app.get("/businesses/:businessId/social", async (req) => {
    const { businessId } = req.params as any; await app.requireBusiness(req, businessId);
    return prisma.socialPost.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 50 });
  });
  app.post("/businesses/:businessId/social", async (req) => {
    const { businessId } = req.params as any; await app.requireBusiness(req, businessId);
    const b = z.object({ channel: z.string(), content: z.string(), mediaUrl: z.string().optional(), scheduledAt: z.string().optional() }).parse(req.body);
    return prisma.socialPost.create({ data: { businessId, channel: b.channel, content: b.content, mediaUrl: b.mediaUrl, status: b.scheduledAt ? "scheduled" : "draft", scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : undefined } });
  });
  app.post("/social/:id/publish", async (req) => {
    const { id } = req.params as any;
    const post = await prisma.socialPost.findUnique({ where: { id } });
    if (!post) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await app.requireBusiness(req, post.businessId);
    const integ = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: post.businessId, provider: post.channel } } });
    if (!integ?.credentials) return { published: false, error: `Connect ${post.channel} first (Settings → Integrations).` };
    try {
      const creds = JSON.parse(decrypt((integ.credentials as any).enc));
      const ref = await publishToChannel(post.channel, creds, post.content, post.mediaUrl ?? undefined);
      return prisma.socialPost.update({ where: { id }, data: { status: "published", publishedAt: new Date(), providerRef: ref } });
    } catch (e: any) {
      return prisma.socialPost.update({ where: { id }, data: { status: "failed", error: String(e.message) } });
    }
  });
}
