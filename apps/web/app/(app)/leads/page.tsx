"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher, api, businessId } from "@/lib/api";

const COLUMNS = ["QUALIFIED", "CONTACTED", "REPLIED", "INTERESTED", "MEETING_SCHEDULED", "WON"];

export default function Leads() {
  const bid = businessId();
  const { data: leads, mutate } = useSWR(bid ? `/businesses/${bid}/leads?take=100` : null, fetcher);
  const [selected, setSelected] = useState<any>(null);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-sm text-ink/60">{leads?.length ?? 0} in pipeline — sorted by score.</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 overflow-x-auto md:grid-cols-3 xl:grid-cols-6">
        {COLUMNS.map((col) => (
          <div key={col} className="min-w-40">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">{col.replace("_", " ")}</div>
            <div className="space-y-2">
              {(leads ?? []).filter((l: any) => l.stage === col).map((l: any) => (
                <button key={l.id} onClick={() => setSelected(l)} className="card w-full p-3 text-left hover:border-signal">
                  <div className="text-sm font-medium">{l.companyName}</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-ink/50">
                    <span>{l.city ?? l.country ?? ""}</span>
                    <span className={`font-semibold ${l.leadScore >= 75 ? "text-signal" : l.leadScore >= 60 ? "text-amber" : ""}`}>{l.leadScore}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected && <LeadDrawer lead={selected} onClose={() => { setSelected(null); mutate(); }} />}
    </div>
  );
}

function LeadDrawer({ lead, onClose }: { lead: any; onClose: () => void }) {
  const { data: full } = useSWR(`/leads/${lead.id}`, fetcher);
  async function move(stage: string) { await api(`/leads/${lead.id}/stage`, { method: "PATCH", body: JSON.stringify({ stage }) }); onClose(); }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/30" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{lead.companyName}</h2>
            <p className="text-sm text-ink/60">{lead.industry ?? "—"} · {lead.city ?? ""} {lead.country ?? ""}</p>
          </div>
          <span className="tag">{lead.stage}</span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="card p-3"><div className="font-display text-2xl">{lead.leadScore}</div><div className="text-xs text-ink/50">Lead score</div></div>
          <div className="card p-3"><div className="font-display text-2xl">{lead.confidenceScore}</div><div className="text-xs text-ink/50">Data confidence</div></div>
          <div className="card p-3"><div className="font-display text-2xl">{full?.messages?.length ?? 0}</div><div className="text-xs text-ink/50">Touches</div></div>
        </div>

        {full?.potentialNeed && <p className="mt-4 rounded-lg bg-signalSoft p-3 text-sm">{full.potentialNeed}</p>}

        <h3 className="mb-2 mt-5 text-sm font-semibold">Contacts</h3>
        {full?.contacts?.map((c: any) => (
          <div key={c.id} className="mb-2 text-sm">{c.name ?? "—"} <span className="text-ink/50">· {c.title ?? ""} · {c.email ?? c.phone ?? ""}</span> {c.verified && <span className="tag">verified</span>}</div>
        ))}

        <h3 className="mb-2 mt-5 text-sm font-semibold">Timeline</h3>
        <div className="space-y-2">
          {full?.activities?.map((a: any) => (
            <div key={a.id} className="text-xs text-ink/60">
              <span className="font-medium text-ink">{a.type.replace(/_/g, " ")}</span> · {new Date(a.createdAt).toLocaleString()}
            </div>
          ))}
        </div>

        <h3 className="mb-2 mt-5 text-sm font-semibold">Move stage</h3>
        <div className="flex flex-wrap gap-2">
          {["INTERESTED", "MEETING_SCHEDULED", "PROPOSAL_SENT", "WON", "LOST"].map((s) => (
            <button key={s} className="btn-ghost text-xs" onClick={() => move(s)}>{s.replace("_", " ")}</button>
          ))}
        </div>
        <button className="btn-ghost mt-6 w-full justify-center text-danger" onClick={async () => { await api(`/leads/${lead.id}/opt-out`, { method: "POST" }); onClose(); }}>
          Opt out & suppress
        </button>
      </div>
    </div>
  );
}
