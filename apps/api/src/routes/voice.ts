import { FastifyInstance } from "fastify";
import { prisma, findLeadByListValue } from "@leadhunter/db";
import { consumeQuota } from "@leadhunter/agents";
import { verifyTwilioSignature, xmlEscape, isProd } from "../lib/security";

/**
 * AI Receptionist — Twilio telephony webhooks.
 *  - Incoming call → return TwiML that opens a Media Stream to the voice bridge
 *    (services/voice), which connects Twilio audio to the OpenAI Realtime API.
 *  - Status + recording callbacks update the Call record.
 * The heavy real-time audio work lives in services/voice; this route is the
 * control plane. Configure your Twilio number's Voice webhook to POST here.
 */
export async function voiceRoutes(app: FastifyInstance) {
  // Twilio posts application/x-www-form-urlencoded (Fastify has no parser for it by default).
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    try { done(null, Object.fromEntries(new URLSearchParams(body as string))); } catch (e: any) { done(e); }
  });
  // Every Twilio callback must carry a valid X-Twilio-Signature (HMAC-SHA1 with TWILIO_AUTH_TOKEN).
  app.addHook("preHandler", async (req, reply) => {
    if (!isProd() && process.env.ALLOW_UNSIGNED_WEBHOOKS === "true") return;
    const base = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, "") : `${req.protocol}://${req.hostname}`;
    if (!verifyTwilioSignature(base + req.url, (req.body ?? {}) as Record<string, string>, req.headers["x-twilio-signature"]))
      return reply.code(403).send({ error: "Invalid Twilio signature (set TWILIO_AUTH_TOKEN and APP_URL)" });
  });

  // Twilio hits this when a call comes in. We answer with a <Connect><Stream>.
  app.post("/incoming", async (req, reply) => {
    const b = (req.body ?? {}) as any;
    const q = (req.query as any).businessId;
    const businessId = typeof q === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(q) ? q : undefined; // number → business mapping via query on the webhook URL
    const from = String(b.From ?? "").slice(0, 32), to = String(b.To ?? "").slice(0, 32), callSid = String(b.CallSid ?? "").slice(0, 64);
    if (businessId && !(await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } })))
      return reply.code(404).type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);

    const lead = businessId ? ((await findLeadByListValue("phones", from, { businessId })) ?? (await prisma.lead.findFirst({ where: { businessId, whatsapp: from } }))) : null;
    await prisma.call.create({ data: { businessId: businessId ?? "unknown", leadId: lead?.id, fromNumber: from, toNumber: to, callSid, status: "in_progress" } }).catch(() => {});

    if (businessId) {
      const tenant = await prisma.business.findUnique({ where: { id: businessId }, select: { tenantId: true } });
      if (tenant) {
        const quota = await consumeQuota(tenant.tenantId, "calls");
        if (!quota.allowed) {
          return reply.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Zeina" language="arb">شكرا لاتصالك. سيعاود فريقنا الاتصال بك قريبا.</Say><Say>Thanks for calling. Our team will call you right back.</Say><Hangup/></Response>`);
        }
      }
    }

    const wsUrl = (process.env.VOICE_WS_URL || "wss://your-voice-bridge.example.com").replace(/^http/, "ws");
    reply.type("text/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${xmlEscape(wsUrl)}/twilio">
      <Parameter name="businessId" value="${xmlEscape(businessId ?? "")}" />
      <Parameter name="callSid" value="${xmlEscape(callSid)}" />
      <Parameter name="from" value="${xmlEscape(from)}" />
    </Stream>
  </Connect>
</Response>`
    );
  });

  app.post("/status", async (req, reply) => {
    const b = (req.body ?? {}) as any;
    if (b.CallSid) await prisma.call.updateMany({ where: { callSid: String(b.CallSid) }, data: { status: b.CallStatus === "completed" ? "completed" : b.CallStatus, durationSec: b.CallDuration ? Number(b.CallDuration) : undefined, endedAt: new Date() } });
    reply.send({ ok: true });
  });

  app.post("/recording", async (req, reply) => {
    const b = (req.body ?? {}) as any;
    if (b.CallSid) await prisma.call.updateMany({ where: { callSid: String(b.CallSid) }, data: { recordingUrl: b.RecordingUrl } });
    reply.send({ ok: true });
  });
}
