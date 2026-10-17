"use client";
import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
import { Sparkles, KeyRound, X } from "lucide-react";
import { fetcher, api, businessId } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { toast } from "@/lib/toast";
import { AGENT_META, FEATURED, metaFor } from "@/lib/agents";
import { AgentCard } from "../AgentCard";

export function AgentsView() {
  const bid = businessId();
  const { data: me } = useMe();
  const { data: agents } = useSWR(bid ? `/businesses/${bid}/agents` : null, fetcher);
  const { data: runs, mutate } = useSWR(bid ? `/businesses/${bid}/agent-runs` : null, fetcher);
  const [task, setTask] = useState<{ role: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const list: any[] = agents ?? [];
  const featured = FEATURED.map((r) => list.find((a) => a.role === r)).filter(Boolean);
  const others = list.filter((a) => !FEATURED.includes(a.role));
  const byDept: Record<string, any[]> = {};
  others.forEach((a) => (byDept[a.department] ??= []).push(a));

  async function assign() {
    if (!task || !task.text.trim()) return;
    setBusy(true);
    try {
      const r = await api(`/businesses/${bid}/agents/${task.role}/run`, { method: "POST", body: JSON.stringify({ input: { task: task.text } }) });
      toast(r.awaitingApproval ? "Done — waiting for your approval." : "Task finished. See recent activity below.");
      setTask(null); mutate();
    } catch (e: any) { toast(e.message, "error"); }
    setBusy(false);
  }

  return (
    <div className="space-y-8">
      {me && !me.aiReady && (
        <div className="flex items-center gap-3 rounded-xl border border-amber/40 bg-amber/10 p-4 text-sm">
          <KeyRound className="h-5 w-5 shrink-0 text-amber" />
          <p className="flex-1">Your agents need an AI key to work. Add a free one from Groq or Google Gemini in a minute.</p>
          <Link href="/settings#keys" className="btn">Add AI key</Link>
        </div>
      )}

      <section>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {featured.map((a: any) => <AgentCard key={a.role} agent={a} onAssign={() => setTask({ role: a.role, text: "" })} />)}
          {!agents && Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-line" />)}
        </div>
      </section>

      <section>
        <button className="btn-ghost" onClick={() => setShowAll(!showAll)}>{showAll ? "Hide" : "Show"} all {others.length} specialists</button>
        {showAll && Object.entries(byDept).map(([dept, ls]) => (
          <div key={dept} className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-ink/60">{dept}</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {ls.map((a) => <AgentCard key={a.role} agent={a} compact onAssign={() => setTask({ role: a.role, text: "" })} />)}
            </div>
          </div>
        ))}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Recent activity</h3>
        <div className="space-y-2">
          {(runs ?? []).slice(0, 12).map((r: any) => {
            const m = metaFor(r.agent.role, r.agent.displayName);
            return (
              <div key={r.id} className="card flex gap-3 py-3 text-sm">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${m.from}, ${m.to})` }}><m.icon className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <div><b>{r.agent.displayName}</b> <span className="text-xs text-ink/45">{r.trigger} · {new Date(r.startedAt).toLocaleString()} · {r.status.replace(/_/g, " ")}</span></div>
                  {r.output?.text && <p className="mt-1 line-clamp-3 text-ink/70">{r.output.text}</p>}
                </div>
              </div>
            );
          })}
          {runs?.length === 0 && <p className="text-sm text-ink/55">Nothing yet. Pick an agent above and give it a first task.</p>}
        </div>
      </section>

      {task && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setTask(null)}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Give {metaFor(task.role, list.find((a) => a.role === task.role)?.displayName).title} a task</h2>
              <button aria-label="Close" onClick={() => setTask(null)}><X className="h-4 w-4" /></button>
            </div>
            <textarea autoFocus className="input h-28" placeholder="What should this agent do?" value={task.text} onChange={(e) => setTask({ ...task, text: e.target.value })} />
            {AGENT_META[task.role] && <button className="mt-2 flex items-center gap-1 text-xs text-signal" onClick={() => setTask({ ...task, text: AGENT_META[task.role].ask })}><Sparkles className="h-3 w-3" /> Try: {AGENT_META[task.role].ask}</button>}
            <button className="btn mt-4 w-full" onClick={assign} disabled={busy || !task.text.trim()}>{busy ? "Working…" : "Run task"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
