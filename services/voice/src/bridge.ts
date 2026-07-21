import WebSocket from "ws";
import { prisma } from "@leadhunter/db";
import { summarizeCall } from "./summarize";
import { receptionistTools, runReceptionistTool } from "./tools";

const REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

/**
 * Wire one phone call: Twilio <-> OpenAI Realtime.
 * Handles interruptions (Realtime emits speech_started → we clear Twilio's
 * buffer), function calls (CRM lookup, booking, transfer, take message),
 * and builds a running transcript that gets summarized when the call ends.
 */
export async function bridgeTwilioToRealtime(twilioWs: WebSocket) {
  let streamSid = "";
  let businessId = "";
  let callSid = "";
  let fromNumber = "";
  const transcript: { role: string; text: string; ts: number }[] = [];

  const openai = new WebSocket(REALTIME_URL, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "OpenAI-Beta": "realtime=v1" },
  });

  openai.on("open", () => {
    openai.send(JSON.stringify({
      type: "session.update",
      session: {
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        turn_detection: { type: "server_vad" },
        input_audio_transcription: { model: "whisper-1" },
        voice: "alloy",
        instructions: `You are the receptionist for a software agency. Speak naturally and warmly in the caller's language (Arabic or English — detect from their speech). Services we offer: Website Development, Mobile Apps, School Management System (Spark-ED), AI Automation, Equipment Rental Software, ERP Development, Custom Software, Digital Marketing. Greet, find out who is calling and why. Use tools to look up existing clients, create leads, book meetings, take messages, or transfer urgent calls to a human. Never quote prices — offer to book a call with the team. Keep turns short; this is a phone call.`,
        tools: receptionistTools,
      },
    }));
  });

  // ── Twilio → OpenAI ──
  twilioWs.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.event === "start") {
      streamSid = msg.start.streamSid;
      businessId = msg.start.customParameters?.businessId ?? "";
      callSid = msg.start.customParameters?.callSid ?? "";
      fromNumber = msg.start.customParameters?.from ?? "";
    } else if (msg.event === "media" && openai.readyState === WebSocket.OPEN) {
      openai.send(JSON.stringify({ type: "input_audio_buffer.append", audio: msg.media.payload }));
    } else if (msg.event === "stop") {
      openai.close();
    }
  });

  // ── OpenAI → Twilio ──
  openai.on("message", async (raw) => {
    const evt = JSON.parse(raw.toString());
    switch (evt.type) {
      case "response.audio.delta":
        twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload: evt.delta } }));
        break;
      case "input_audio_buffer.speech_started": // caller interrupted → stop our playback
        twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
        break;
      case "conversation.item.input_audio_transcription.completed":
        transcript.push({ role: "caller", text: evt.transcript ?? "", ts: Date.now() });
        break;
      case "response.audio_transcript.done":
        transcript.push({ role: "receptionist", text: evt.transcript ?? "", ts: Date.now() });
        break;
      case "response.function_call_arguments.done": {
        const result = await runReceptionistTool(evt.name, JSON.parse(evt.arguments || "{}"), { businessId, callSid, fromNumber });
        openai.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: evt.call_id, output: JSON.stringify(result) } }));
        openai.send(JSON.stringify({ type: "response.create" }));
        break;
      }
    }
  });

  const finish = async () => {
    try { openai.close(); } catch {}
    if (!callSid) return;
    const summary = await summarizeCall(transcript, businessId).catch(() => null);
    await prisma.call.updateMany({
      where: { callSid },
      data: { transcript: transcript as any, status: "completed", endedAt: new Date(), summary: summary?.summary, sentiment: summary?.sentiment, intent: summary?.intent },
    });
  };
  twilioWs.on("close", finish);
  openai.on("close", () => { twilioWs.close(); });
  openai.on("error", (e) => console.error("realtime error", e));
}
