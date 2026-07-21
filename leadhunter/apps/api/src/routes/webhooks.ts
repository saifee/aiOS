import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { queues } from "../lib/queues";
import { verifyWebhook, PLANS } from "@leadhunter/integrations";

/**
 * Inbound webhooks (provider-verified, no user JWT):
 *  - WhatsApp Cloud API (Meta): verification + inbound messages + delivery statuses
 *  - SendGrid Event Webhook: opens, bounces, spam reports
 *  - Inbound email parse (SendGrid Inbound Parse / SES SNS): replies
 * Every inbound reply is stored, opt-out keywords are honored, then handed to
 * the conversation queue where the AI agent takes over.
 */
export async function webhookRoutes(app: FastifyInstance) {
  // Meta verification handshake
  app.get("/whatsapp", async (req, reply) => {
    const q = req.query as any;
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN)
      return reply.send(q["hub.challenge"]);
    return reply.code(403).send();
  });

  app.post("/whatsapp", async (req, reply) => {
    const body = req.body as any;
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    for (const m of value?.messages ?? []) {
      const from: string = m.from;
      const text: string = m.text?.body ?? "";
      const lead = await prisma.lead.findFirst({ where: { whatsapp: { contains: from.slice(-9) } } });
      if (!lead) continue;
      await handleInbound(lead.id, "WHATSAPP", text);
    }
    for (const s of value?.statuses ?? []) {
      await prisma.message.updateMany({ where: { providerId: s.id }, data: { status: s.status === "read" ? "OPENED" : s.status === "delivered" ? "DELIVERED" : undefined, ...(s.status === "read" && { openedAt: new Date() }) } });
    }
    return reply.send({ ok: true });
  });

  // SendGrid event webhook (opens / bounces / spam)
  app.post("/sendgrid/events", async (req, reply) => {
    for (const e of (req.body as any[]) ?? []) {
      if (e.event === "open")
        await prisma.message.updateMany({ where: { providerId: e.sg_message_id }, data: { status: "OPENED", openedAt: new Date() } });
      if (e.event === "bounce" || e.event === "spamreport") {
        await prisma.message.updateMany({ where: { providerId: e.sg_message_id }, data: { status: "BOUNCED" } });
        await prisma.suppression.upsert({
          where: { scope_value: { scope: "email", value: e.email } },
          update: {}, create: { scope: "email", value: e.email, reason: e.event === "bounce" ? "bounce" : "complaint" },
        });
      }
    }
    return reply.send({ ok: true });
  });

  // Inbound email reply. SendGrid Inbound Parse posts multipart/form-data; the
  // multipart plugin (attachFieldsToBody) exposes the fields on req.body, so this
  // works for both SendGrid multipart and plain JSON test posts.
  app.post("/email/inbound", async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const from = body.from ?? body.From ?? body.sender ?? "";
    const bodyText = body.text ?? body.plain ?? stripHtml(body.html) ?? "";
    const email = String(from).match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]?.toLowerCase();
    if (!email) return reply.send({ ok: true });
    const lead = await prisma.lead.findFirst({ where: { emails: { has: email } } });
    if (lead) await handleInbound(lead.id, "EMAIL", String(bodyText));
    return reply.send({ ok: true });
  });

  // Cal.com / booking webhook → meeting created
  app.post("/calendar/booked", async (req, reply) => {
    const { leadId, startsAt, endsAt, joinUrl, provider } = req.body as any;
    if (leadId && startsAt) {
      await prisma.meeting.create({ data: { leadId, provider: provider ?? "calcom", startsAt: new Date(startsAt), endsAt: new Date(endsAt ?? startsAt), joinUrl } });
      await prisma.lead.update({ where: { id: leadId }, data: { stage: "MEETING_SCHEDULED" } });
      await queues.notify.add("notify", { leadId, kind: "meeting_booked" });
    }
    return reply.send({ ok: true });
  });
}

function stripHtml(h?: string) { return h ? h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : ""; }

const OPT_OUT = /\b(stop|unsubscribe|remove me|لا اريد|إلغاء الاشتراك)\b/i;

async function handleInbound(leadId: string, channel: "EMAIL" | "WHATSAPP", text: string) {
  await prisma.message.create({ data: { leadId, channel, direction: "INBOUND", body: text, status: "REPLIED" } });
  await prisma.lead.update({ where: { id: leadId }, data: { stage: "REPLIED" } });
  await prisma.activity.create({ data: { leadId, type: "reply", detail: { channel, preview: text.slice(0, 200) } } });

  if (OPT_OUT.test(text)) {
    const lead = await prisma.lead.update({ where: { id: leadId }, data: { optedOut: true, stage: "ARCHIVED" } });
    for (const e of lead.emails)
      await prisma.suppression.upsert({ where: { scope_value: { scope: "email", value: e } }, update: {}, create: { scope: "email", value: e, reason: "opt_out" } });
    if (lead.whatsapp)
      await prisma.suppression.upsert({ where: { scope_value: { scope: "phone", value: lead.whatsapp } }, update: {}, create: { scope: "phone", value: lead.whatsapp, reason: "opt_out" } });
    return;
  }
  await queues.conversation.add("handle-reply", { leadId, channel, text });

  // Stripe billing webhook — signature-verified. Keeps Subscription in sync.
  app.post("/stripe", { config: { rawBody: true } }, async (req, reply) => {
    let event: any;
    try { event = verifyWebhook((req as any).rawBody ?? JSON.stringify(req.body), req.headers["stripe-signature"] as string); }
    catch (e: any) { return reply.code(400).send(`Webhook error: ${e.message}`); }
    const obj = event.data.object as any;
    if (["checkout.session.completed", "customer.subscription.updated", "customer.subscription.created", "customer.subscription.deleted"].includes(event.type)) {
      const customerId = obj.customer;
      const tenant = await prisma.tenant.findFirst({ where: { stripeCustomerId: customerId } });
      if (tenant) {
        const priceId = obj.items?.data?.[0]?.price?.id ?? obj.line_items?.data?.[0]?.price?.id;
        const planKey = (Object.entries(PLANS).find(([, p]) => p.priceId && p.priceId === priceId)?.[0] ?? "TRIAL");
        const status = event.type === "customer.subscription.deleted" ? "canceled" : (obj.status ?? "active");
        await prisma.subscription.upsert({
          where: { tenantId: tenant.id },
          update: { plan: planKey as any, status, stripeSubscriptionId: obj.id ?? obj.subscription, stripePriceId: priceId, currentPeriodEnd: obj.current_period_end ? new Date(obj.current_period_end * 1000) : undefined },
          create: { tenantId: tenant.id, plan: planKey as any, status, stripeSubscriptionId: obj.id ?? obj.subscription, stripePriceId: priceId },
        });
        await prisma.tenant.update({ where: { id: tenant.id }, data: { plan: planKey as any } });
      }
    }
    return reply.send({ received: true });
  });

}
