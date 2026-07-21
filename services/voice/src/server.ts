import { WebSocketServer } from "ws";
import { bridgeTwilioToRealtime } from "./bridge";

/**
 * Voice bridge server. Twilio Media Streams connect here over WebSocket
 * (URL set in the <Stream> TwiML from apps/api/src/routes/voice.ts).
 * For each call we open a second WebSocket to the OpenAI Realtime API and
 * relay audio both ways. Twilio and OpenAI Realtime both speak G.711 μ-law,
 * so audio passes through without transcoding.
 */
const PORT = Number(process.env.VOICE_PORT || 5050);
const wss = new WebSocketServer({ port: PORT, path: "/twilio" });

wss.on("connection", (twilioWs) => {
  console.log("Twilio media stream connected");
  bridgeTwilioToRealtime(twilioWs).catch((e) => console.error("bridge error", e));
});

console.log(`Voice bridge listening on ws://0.0.0.0:${PORT}/twilio`);
