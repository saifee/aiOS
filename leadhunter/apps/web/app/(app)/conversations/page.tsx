"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher, api, businessId } from "@/lib/api";

export default function Conversations() {
  const bid = businessId();
  const { data, mutate } = useSWR(bid ? `/businesses/${bid}/conversations` : null, fetcher);
  const [reply, setReply] = useState<{ id: string; text: string } | null>(null);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Conversations</h1>
        <p className="text-sm text-ink/60">The AI handles replies; anything marked handoff is waiting for you.</p>
      </header>
      <div className="space-y-3">
        {(data ?? []).map((c: any) => (
          <div key={c.id} className="card">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{c.lead.companyName}</span>
                <span className="ml-2 text-xs text-ink/50">{c.channel} · intent: {c.intent ?? "—"} · score {c.lead.leadScore}</span>
              </div>
              <span className={`tag ${c.state === "HUMAN_HANDOFF" ? "bg-amber/15 text-amber" : ""}`}>{c.state.replace("_", " ")}</span>
            </div>
            {c.summary && <p className="mt-2 text-sm text-ink/70">{c.summary}</p>}
            <div className="mt-3 flex gap-2">
              {c.state === "AI_HANDLING" && (
                <button className="btn-ghost text-xs" onClick={async () => { await api(`/conversations/${c.id}/handoff`, { method: "POST" }); mutate(); }}>Take over</button>
              )}
              <button className="btn-ghost text-xs" onClick={() => setReply({ id: c.id, text: "" })}>Reply</button>
            </div>
            {reply?.id === c.id && (
              <div className="mt-3 flex gap-2">
                <input className="input" placeholder="Your message…" value={reply.text} onChange={(e) => setReply({ ...reply, text: e.target.value })} />
                <button className="btn" onClick={async () => { await api(`/conversations/${c.id}/reply`, { method: "POST", body: JSON.stringify({ body: reply.text }) }); setReply(null); mutate(); }}>Send</button>
              </div>
            )}
          </div>
        ))}
        {data?.length === 0 && <p className="text-sm text-ink/50">No conversations yet — they appear the moment a lead replies.</p>}
      </div>
    </div>
  );
}
