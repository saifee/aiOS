"use client";
import useSWR from "swr";
import { fetcher, businessId } from "@/lib/api";

export default function Receptionist() {
  const bid = businessId();
  const { data: calls } = useSWR(bid ? `/businesses/${bid}/calls` : null, fetcher);
  const sentimentColor = (s?: string) => s === "positive" ? "text-signal" : s === "negative" ? "text-danger" : "text-ink/50";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">AI Receptionist</h1>
        <p className="text-sm text-ink/60">Every call answered 24/7 in Arabic or English, transcribed, summarized, and logged to the CRM.</p>
      </header>

      <div className="card bg-signalSoft">
        <p className="text-sm text-ink/70">
          <span className="font-semibold">Setup:</span> point your Twilio number's Voice webhook to
          <code className="mx-1 rounded bg-white px-1">POST /v1/voice/incoming?businessId={bid ?? "…"}</code>
          and run the voice bridge service. The receptionist connects live audio to the OpenAI Realtime API.
        </p>
      </div>

      <div className="space-y-3">
        {(calls ?? []).map((c: any) => (
          <div key={c.id} className="card">
            <div className="flex items-center justify-between">
              <div className="font-medium">{c.lead?.companyName ?? c.fromNumber}</div>
              <div className="text-xs text-ink/50">{new Date(c.startedAt).toLocaleString()} · {c.durationSec ? `${c.durationSec}s` : c.status}</div>
            </div>
            <div className="mt-1 flex gap-3 text-xs">
              {c.intent && <span className="tag">{c.intent}</span>}
              {c.sentiment && <span className={sentimentColor(c.sentiment)}>{c.sentiment}</span>}
              {c.language && <span className="text-ink/40">{c.language}</span>}
            </div>
            {c.summary && <p className="mt-2 text-sm text-ink/70">{c.summary}</p>}
          </div>
        ))}
        {calls?.length === 0 && <p className="text-sm text-ink/50">No calls yet. Once your number is connected, every call appears here with a full transcript and summary.</p>}
      </div>
    </div>
  );
}
