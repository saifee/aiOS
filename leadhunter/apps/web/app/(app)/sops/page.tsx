"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher, api, businessId } from "@/lib/api";

export default function Sops() {
  const bid = businessId();
  const { data: sops, mutate } = useSWR(bid ? `/businesses/${bid}/sops` : null, fetcher);
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function generate(fromActivity = false) {
    setBusy(true);
    await api(`/businesses/${bid}/sops/generate`, { method: "POST", body: JSON.stringify(fromActivity ? { fromActivity: true } : { description: desc }) }).catch((e) => alert(e.message));
    setBusy(false); setDesc(""); mutate();
  }
  async function activate(id: string) { await api(`/sops/${id}/activate`, { method: "POST" }); mutate(); }
  async function run(id: string) { const r = await api(`/sops/${id}/run`, { method: "POST" }); alert(r.ran ? (r.awaitingApproval ? "Ran — awaiting your approval." : "Ran: " + (r.result ?? "").slice(0, 200)) : r.note); mutate(); }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">SOP Engine</h1>
        <p className="text-sm text-ink/60">Describe a process — or let the AI watch how you work — and it becomes a repeatable procedure you can automate.</p>
      </header>

      <div className="card">
        <textarea className="input h-24" placeholder='Describe a process, e.g. "When a school requests a demo, confirm student count, send the Spark-ED deck, and book a call within 24 hours."' value={desc} onChange={(e) => setDesc(e.target.value)} />
        <div className="mt-3 flex gap-2">
          <button className="btn" disabled={busy || !desc.trim()} onClick={() => generate(false)}>{busy ? "Writing…" : "Turn into SOP"}</button>
          <button className="btn-ghost" disabled={busy} onClick={() => generate(true)}>Generate from recent activity</button>
        </div>
      </div>

      <div className="space-y-3">
        {(sops ?? []).map((s: any) => (
          <div key={s.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">{s.title}</div>
                <div className="mt-0.5 text-xs text-ink/50">{s.department} · trigger: {s.trigger} · <span className="tag">{s.source}</span></div>
              </div>
              <span className={`tag ${s.status === "active" ? "" : "opacity-50"}`}>{s.status}</span>
            </div>
            {s.description && <p className="mt-2 text-sm text-ink/70">{s.description}</p>}
            <button className="mt-2 text-xs text-signal" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Hide steps" : `View ${(s.steps ?? []).length} steps`}</button>
            {open === s.id && (
              <ol className="mt-2 space-y-1.5 border-l-2 border-signalSoft pl-4">
                {(s.steps ?? []).map((st: any, i: number) => (
                  <li key={i} className="text-sm"><span className="font-medium">{st.n ?? i + 1}.</span> {st.action} {st.owner && <span className="text-xs text-ink/40">· {st.owner}</span>} {st.tool && <span className="tag">{st.tool}</span>}</li>
                ))}
              </ol>
            )}
            <div className="mt-3 flex gap-2">
              {s.status !== "active" && <button className="btn-ghost text-xs" onClick={() => activate(s.id)}>Activate</button>}
              {s.automation?.role && <button className="btn text-xs" onClick={() => run(s.id)}>Run now ({s.automation.role})</button>}
            </div>
          </div>
        ))}
        {sops?.length === 0 && <p className="text-sm text-ink/50">No SOPs yet. Describe your first process above.</p>}
      </div>
    </div>
  );
}
