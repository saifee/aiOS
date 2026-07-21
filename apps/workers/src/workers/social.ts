import { Job } from "bullmq";
import { prisma } from "@leadhunter/db";
import { publishToChannel, decrypt } from "@leadhunter/integrations";

/** Publishes scheduled social posts whose time has arrived. */
export async function socialProcessor(_job: Job) {
  const due = await prisma.socialPost.findMany({ where: { status: "scheduled", scheduledAt: { lte: new Date() } }, take: 20 });
  for (const post of due) {
    const integ = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: post.businessId, provider: post.channel } } });
    if (!integ?.credentials) { await prisma.socialPost.update({ where: { id: post.id }, data: { status: "failed", error: `${post.channel} not connected` } }); continue; }
    try {
      const creds = JSON.parse(decrypt((integ.credentials as any).enc));
      const ref = await publishToChannel(post.channel, creds, post.content, post.mediaUrl ?? undefined);
      await prisma.socialPost.update({ where: { id: post.id }, data: { status: "published", publishedAt: new Date(), providerRef: ref } });
    } catch (e: any) {
      await prisma.socialPost.update({ where: { id: post.id }, data: { status: "failed", error: String(e.message) } });
    }
  }
}
