# AI Receptionist (voice)

Answers calls 24/7 in Arabic/English, holds a natural conversation, looks up
clients, qualifies prospects, books meetings, takes messages, transfers urgent
calls, and logs every call to the CRM with a transcript, summary, sentiment,
and intent.

## How it works
```
Caller → Twilio number
   │  Voice webhook: POST /v1/voice/incoming?businessId=…
   ▼
API returns TwiML <Connect><Stream url="wss://voice-bridge/twilio">
   ▼
services/voice bridge  ⇄  OpenAI Realtime API
   (Twilio μ-law audio passes straight through — both use G.711 μ-law)
   │  mid-call function calls: lookup_client, create_lead, book_meeting,
   │  take_message, transfer_call
   ▼
Call ends → transcript saved → Claude summary + sentiment + intent → CRM
```

Interruptions are handled: when the caller starts speaking, the bridge clears
Twilio's playback buffer so the receptionist stops talking, like a human would.

## Setup
1. Buy a Twilio number; set its Voice webhook to `POST https://api.yourdomain.com/v1/voice/incoming?businessId=<id>` and status callback to `/v1/voice/status`.
2. Deploy `services/voice` on a public host with a `wss://` URL; set `VOICE_WS_URL`.
3. Set `OPENAI_API_KEY` (Realtime), `TWILIO_*`, `ANTHROPIC_API_KEY` (summaries).
4. Call the number.

## Notes
- Real-time voice needs live credentials and a reachable wss endpoint; it can't be exercised without a phone call. The bridge code is complete and standards-correct.
- To transfer, the bridge marks the call; return `transferTwiml(humanNumber)` from a Twilio redirect to actually dial a human.
