"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher, api, businessId } from "@/lib/api";

export default function Campaigns() {
  const bid = businessId();
  const { data, mutate } = useSWR(bid ? `/businesses/${bid}/campaigns` : null, fetcher);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: "", channels: ["EMAIL"], sources: ["places", "google_search"] });

  async function create() {
    await api(`/businesses/${bid}/campaigns`, { method: "POST", body: JSON.stringify(form) });
    setShow(false); mutate();
  }
  const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Campaigns</h1>
          <p className="text-sm text-ink/60">Each campaign is a standing order: the agent hunts on repeat every 6 hours.</p>
        </div>
        <button className="btn" onClick={() => setShow(true)}>New hunt</button>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data ?? []).map((c: any) => (
          <div key={c.id} className="card">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{c.name}</h2>
              <span className={`tag ${c.status !== "ACTIVE" && "opacity-50"}`}>{c.status}</span>
            </div>
            <p className="mt-2 text-xs text-ink/50">{c._count?.leads ?? 0} leads · {c.channels.join(" + ")} · sources: {c.sources.join(", ")}</p>
            <div className="mt-3 flex gap-2">
              <button className="btn-ghost text-xs" onClick={async () => { await api(`/campaigns/${c.id}/status`, { method: "PATCH", body: JSON.stringify({ status: c.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }) }); mutate(); }}>
                {c.status === "ACTIVE" ? "Pause" : "Resume"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {show && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30" onClick={() => setShow(false)}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">New hunt</h2>
            <input className="input mb-3" placeholder="Campaign name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <p className="mb-1 text-xs font-medium text-ink/60">Channels</p>
            <div className="mb-3 flex gap-2">
              {["EMAIL", "WHATSAPP"].map((ch) => (
                <button key={ch} className={`btn-ghost text-xs ${form.channels.includes(ch) && "border-signal bg-signalSoft"}`} onClick={() => setForm({ ...form, channels: toggle(form.channels, ch) })}>{ch}</button>
              ))}
            </div>
            <p className="mb-1 text-xs font-medium text-ink/60">Discovery sources</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {["places", "google_search", "directories", "tenders", "jobs", "news"].map((s) => (
                <button key={s} className={`btn-ghost text-xs ${form.sources.includes(s) && "border-signal bg-signalSoft"}`} onClick={() => setForm({ ...form, sources: toggle(form.sources, s) })}>{s}</button>
              ))}
            </div>
            <button className="btn w-full justify-center" onClick={create}>Release the agent</button>
          </div>
        </div>
      )}
    </div>
  );
}
