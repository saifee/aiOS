import { FastifyInstance } from "fastify";
import { prisma } from "@leadhunter/db";
import { consumeQuota } from "@leadhunter/agents";

/**
 * AI Receptionist — Twilio telephony webhooks.
 *  - Incoming call → return TwiML that opens a Media Stream to the voice bridge
 *    (services/voice), which connects Twilio audio to the OpenAI Realtime API.
 *  - Status + recording callbacks update the Call record.
 * The heavy real-time audio work lives in services/voice; this route is the
 * control plane. Configure your Twilio number's Voice webhook to POST here.
 */
export async function voiceRoutes(app: FastifyInstance) {
  // Twilio hits this when a call comes in. We answer with a <Connect><Stream>.
  app.post("/incoming", async (req, reply) => {
    const b = req.body as any;
    const businessId = (req.query as any).businessId as string; // number → business mapping via query on the webhook URL
    const from = b.From, to = b.To, callSid = b.CallSid;

    const lead = businessId ? await prisma.lead.findFirst({ where: { businessId, OR: [{ phones: { has: from } }, { whatsapp: from }] } }) : null;
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
    <Stream url="${wsUrl}/twilio">
      <Parameter name="businessId" value="${businessId ?? ""}" />
      <Parameter name="callSid" value="${callSid}" />
      <Parameter name="from" value="${from}" />
    </Stream>
  </Connect>
</Response>`
    );
  });

  app.post("/status", async (req, reply) => {
    const b = req.body as any;
    if (b.CallSid) await prisma.call.updateMany({ where: { callSid: b.CallSid }, data: { status: b.CallStatus === "completed" ? "completed" : b.CallStatus, durationSec: b.CallDuration ? Number(b.CallDuration) : undefined, endedAt: new Date() } });
    reply.send({ ok: true });
  });

  app.post("/recording", async (req, reply) => {
    const b = req.body as any;
    if (b.CallSid) await prisma.call.updateMany({ where: { callSid: b.CallSid }, data: { recordingUrl: b.RecordingUrl } });
    reply.send({ ok: true });
  });
}
