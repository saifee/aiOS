import { FastifyInstance } from "fastify";
import { prisma, arr, findLeadByListValue } from "@leadhunter/db";
import { queues } from "../lib/queues";
import { loadPaymentConfig } from "../lib/payments";
import { verifyWebhook, PLANS } from "@leadhunter/integrations";
import { z } from "zod";
import { timingSafeEqual } from "crypto";
import { verifyMetaSignature, verifySendgridSignature, verifySharedSecret, hmacHex, isProd } from "../lib/security";

const raw = { config: { rawBody: true, rateLimit: { max: 120, timeWindow: "1 minute" } } };
const deny = (reply: any, why: string) => reply.code(401).send({ error: `Webhook rejected: ${why}` });
// Unsigned webhooks are refused unless an operator explicitly opts out (local testing only).
const unsignedAllowed = () => !isProd() && process.env.ALLOW_UNSIGNED_WEBHOOKS === "true";
const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

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
    const want = process.env.WHATSAPP_VERIFY_TOKEN;
    if (want && q["hub.mode"] === "subscribe" && typeof q["hub.verify_token"] === "string" && eq(q["hub.verify_token"], want))
      return reply.type("text/plain").send(String(q["hub.challenge"] ?? "").replace(/[^\w-]/g, ""));
    return reply.code(403).send();
  });

  app.post("/whatsapp", raw, async (req, reply) => {
    if (!unsignedAllowed() && !verifyMetaSignature((req as any).rawBody, req.headers["x-hub-signature-256"])) return deny(reply, "bad or missing signature (set WHATSAPP_APP_SECRET)");
    const body = req.body as any;
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    for (const m of value?.messages ?? []) {
      const from: string = String(m.from ?? "");
      const text: string = String(m.text?.body ?? "").slice(0, 4000);
      if (from.replace(/\D/g, "").length < 7) continue; // avoid contains-matching on tiny fragments
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
  app.post("/sendgrid/events", raw, async (req, reply) => {
    const signed = verifySendgridSignature((req as any).rawBody, req.headers["x-twilio-email-event-webhook-signature"], req.headers["x-twilio-email-event-webhook-timestamp"]);
    if (!unsignedAllowed() && !signed && !verifySharedSecret(req)) return deny(reply, "bad or missing signature (set SENDGRID_WEBHOOK_PUBLIC_KEY or WEBHOOK_SHARED_SECRET)");
    if (!Array.isArray(req.body)) return reply.code(400).send({ error: "Expected an array of events" });
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
  app.post("/email/inbound", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    // SendGrid Inbound Parse cannot sign; protect the URL with ?token=WEBHOOK_SHARED_SECRET.
    if (!unsignedAllowed() && !verifySharedSecret(req)) return deny(reply, "missing or bad token (set WEBHOOK_SHARED_SECRET and add ?token=… to the Inbound Parse URL)");
    const body = (req.body ?? {}) as any;
    const from = body.from ?? body.From ?? body.sender ?? "";
    const bodyText = body.text ?? body.plain ?? stripHtml(body.html) ?? "";
    const email = String(from).match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]?.toLowerCase();
    if (!email) return reply.send({ ok: true });
    const lead = await findLeadByListValue("emails", email);
    if (lead) await handleInbound(lead.id, "EMAIL", String(bodyText));
    return reply.send({ ok: true });
  });

  // Cal.com / booking webhook → meeting created
  app.post("/calendar/booked", raw, async (req, reply) => {
    // Cal.com signs with HMAC-SHA256 (x-cal-signature-256); otherwise fall back to the shared secret.
    const calSecret = process.env.CALCOM_WEBHOOK_SECRET, sig = req.headers["x-cal-signature-256"];
    const calOk = !!(calSecret && typeof sig === "string" && (req as any).rawBody && eq(sig, hmacHex(calSecret, (req as any).rawBody)));
    if (!unsignedAllowed() && !calOk && !verifySharedSecret(req)) return deny(reply, "bad or missing signature (set CALCOM_WEBHOOK_SECRET or WEBHOOK_SHARED_SECRET)");
    const parsed = z.object({ leadId: z.string().min(1).max(64), startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }).optional(), joinUrl: z.string().url().max(500).optional(), provider: z.string().max(40).optional() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });
    const { leadId, startsAt, endsAt, joinUrl, provider } = parsed.data;
    if (await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } })) {
      await prisma.meeting.create({ data: { leadId, provider: provider ?? "calcom", startsAt: new Date(startsAt), endsAt: new Date(endsAt ?? startsAt), joinUrl } });
      await prisma.lead.update({ where: { id: leadId }, data: { stage: "MEETING_SCHEDULED" } });
      await queues.notify.add("notify", { leadId, kind: "meeting_booked" });
    }
    return reply.send({ ok: true });
  });

  // Stripe billing webhook — signature-verified. Keeps Subscription in sync.
  app.post("/stripe", { config: { rawBody: true } }, async (req, reply) => {
    let event: any;
    // Signature must be verified against the exact raw bytes — never a re-serialised body.
    if (!(req as any).rawBody || typeof req.headers["stripe-signature"] !== "string") return reply.code(400).send({ error: "Missing signature" });
    await loadPaymentConfig().catch(() => {});
    try { event = verifyWebhook((req as any).rawBody, req.headers["stripe-signature"] as string); }
    catch (e: any) { req.log.warn({ msg: e?.message }, "stripe webhook rejected"); return reply.code(400).send({ error: "Invalid signature" }); }
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

function stripHtml(h?: string) { return h ? h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : ""; }

const OPT_OUT = /\b(stop|unsubscribe|remove me|لا اريد|إلغاء الاشتراك)\b/i;

async function handleInbound(leadId: string, channel: "EMAIL" | "WHATSAPP", text: string) {
  await prisma.message.create({ data: { leadId, channel, direction: "INBOUND", body: text, status: "REPLIED" } });
  await prisma.lead.update({ where: { id: leadId }, data: { stage: "REPLIED" } });
  await prisma.activity.create({ data: { leadId, type: "reply", detail: { channel, preview: text.slice(0, 200) } } });

  if (OPT_OUT.test(text)) {
    const lead = await prisma.lead.update({ where: { id: leadId }, data: { optedOut: true, stage: "ARCHIVED" } });
    for (const e of arr(lead.emails))
      await prisma.suppression.upsert({ where: { scope_value: { scope: "email", value: e } }, update: {}, create: { scope: "email", value: e, reason: "opt_out" } });
    if (lead.whatsapp)
      await prisma.suppression.upsert({ where: { scope_value: { scope: "phone", value: lead.whatsapp } }, update: {}, create: { scope: "phone", value: lead.whatsapp, reason: "opt_out" } });
    return;
  }
  await queues.conversation.add("handle-reply", { leadId, channel, text });
}
