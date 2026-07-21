"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher, api, businessId } from "@/lib/api";

export default function CommandCenter() {
  const bid = businessId();
  const { data: brief } = useSWR(bid ? `/businesses/${bid}/morning-brief` : null, fetcher);
  const { data: approvals, mutate: mutateApprovals } = useSWR(bid ? `/businesses/${bid}/approvals` : null, fetcher);
  const [cmd, setCmd] = useState("");
  const [log, setLog] = useState<{ cmd: string; reply: string; actions: string[] }[]>([]);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!cmd.trim()) return;
    setBusy(true);
    const c = cmd; setCmd("");
    try {
      const res = await api(`/businesses/${bid}/command`, { method: "POST", body: JSON.stringify({ text: c }) });
      setLog([{ cmd: c, reply: res.reply, actions: res.actions }, ...log]);
    } catch (e: any) { setLog([{ cmd: c, reply: "Error: " + e.message, actions: [] }, ...log]); }
    setBusy(false);
  }

  const examples = [
    "Call all schools in Jeddah with more than 500 students",
    "Follow up with everyone who received a proposal last week",
    "Show me which projects are least profitable",
    "Launch a LinkedIn campaign targeting hospital administrators",
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Command Center</h1>
        <p className="text-sm text-ink/60">Your agency ran overnight. Here's what happened — and what needs you.</p>
      </header>

      {/* Command bar */}
      <div className="card bg-ink text-white">
        <div className="flex gap-2">
          <input
            className="input flex-1 border-white/20 bg-white/10 text-white placeholder:text-white/40"
            placeholder="Tell the company what to do…"
            value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
          <button className="btn" onClick={run} disabled={busy}>{busy ? "Working…" : "Run"}</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button key={ex} className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/60 hover:bg-white/10" onClick={() => setCmd(ex)}>{ex}</button>
          ))}
        </div>
      </div>

      {log.length > 0 && (
        <div className="space-y-3">
          {log.map((l, i) => (
            <div key={i} className="card">
              <div className="text-xs font-medium text-signal">↳ {l.cmd}</div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink/80">{l.reply}</p>
              {l.actions.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{l.actions.map((a, j) => <span key={j} className="tag">{a.replace(/_/g, " ")}</span>)}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Morning brief */}
      <section className="grid gap-4 md:grid-cols-3">
        {brief?.headlines?.map((h: string, i: number) => (
          <div key={i} className="card"><p className="text-sm">{h}</p></div>
        ))}
        {brief && brief.headlines?.length === 0 && <div className="card md:col-span-3"><p className="text-sm text-ink/50">Quiet overnight. Your agents are standing by — set up a campaign or connect your phone number to get things moving.</p></div>}
      </section>

      {/* Approvals — human in the loop */}
      {approvals?.length > 0 && (
        <section className="card border-amber/40">
          <h2 className="mb-3 text-sm font-semibold text-amber">Needs your approval</h2>
          {approvals.map((a: any) => (
            <div key={a.id} className="mb-3 flex items-center justify-between border-b border-line pb-3 last:border-0">
              <div>
                <div className="text-sm font-medium">{a.action.replace(/_/g, " ")}</div>
                <div className="text-xs text-ink/60">{a.summary} · <span className="text-ink/40">{a.agentRole}</span></div>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost text-xs" onClick={async () => { await api(`/approvals/${a.id}/decide`, { method: "POST", body: JSON.stringify({ decision: "rejected" }) }); mutateApprovals(); }}>Reject</button>
                <button className="btn text-xs" onClick={async () => { await api(`/approvals/${a.id}/decide`, { method: "POST", body: JSON.stringify({ decision: "approved" }) }); mutateApprovals(); }}>Approve</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {brief && (
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[["New leads", brief.newLeads], ["Calls handled", brief.callsDone], ["Interested", brief.interested], ["Won this month", brief.wonThisMonth]].map(([l, v]: any) => (
            <div key={l} className="card text-center"><div className="font-display text-3xl font-semibold text-signal">{v}</div><div className="mt-1 text-xs text-ink/50">{l}</div></div>
          ))}
        </section>
      )}
    </div>
  );
}
