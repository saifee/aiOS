"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher, api, businessId } from "@/lib/api";

export default function Workforce() {
  const bid = businessId();
  const { data: agents } = useSWR(bid ? `/businesses/${bid}/agents` : null, fetcher);
  const { data: runs, mutate } = useSWR(bid ? `/businesses/${bid}/agent-runs` : null, fetcher);
  const [task, setTask] = useState<{ role: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const byDept: Record<string, any[]> = {};
  (agents ?? []).forEach((a: any) => { (byDept[a.department] ??= []).push(a); });

  async function assign() {
    if (!task) return;
    setBusy(true);
    await api(`/businesses/${bid}/agents/${task.role}/run`, { method: "POST", body: JSON.stringify({ input: { task: task.text } }) }).catch(() => {});
    setBusy(false); setTask(null); mutate();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">AI Workforce</h1>
        <p className="text-sm text-ink/60">Every department is an autonomous AI employee — sharing one CRM, memory, and calendar.</p>
      </header>

      {Object.entries(byDept).map(([dept, list]) => (
        <section key={dept}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">{dept}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((a) => (
              <div key={a.role} className="card">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{a.displayName}</div>
                  <span className={`inline-block h-2 w-2 rounded-full ${a.status === "active" ? "bg-signal" : "bg-line"}`} />
                </div>
                <div className="mt-1 text-xs text-ink/50">{a.tools.length} tools · {a.lastRun ? `last active ${new Date(a.lastRun).toLocaleDateString()}` : "idle"}</div>
                <button className="btn-ghost mt-3 w-full justify-center text-xs" onClick={() => setTask({ role: a.role, text: "" })}>Assign task</button>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Recent activity</h2>
        <div className="space-y-2">
          {(runs ?? []).slice(0, 15).map((r: any) => (
            <div key={r.id} className="card py-3 text-sm">
              <span className="font-medium">{r.agent.displayName}</span>
              <span className="ml-2 text-xs text-ink/40">{r.trigger} · {new Date(r.startedAt).toLocaleString()} · {r.status}</span>
              {r.output?.text && <p className="mt-1 text-ink/70">{r.output.text.slice(0, 240)}</p>}
            </div>
          ))}
          {runs?.length === 0 && <p className="text-sm text-ink/50">No agent activity yet. Assign a task or issue a command from the Command Center.</p>}
        </div>
      </section>

      {task && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30" onClick={() => setTask(null)}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-lg font-semibold">Assign to {agents?.find((a: any) => a.role === task.role)?.displayName}</h2>
            <textarea className="input h-28" placeholder="What should this agent do?" value={task.text} onChange={(e) => setTask({ ...task, text: e.target.value })} />
            <button className="btn mt-3 w-full justify-center" onClick={assign} disabled={busy}>{busy ? "Working…" : "Run agent"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
