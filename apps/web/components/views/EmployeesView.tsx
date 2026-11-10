"use client";
import useSWR from "swr";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Play, X, Check, Loader2, Globe } from "lucide-react";
import { api, fetcher, businessId } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { toast } from "@/lib/toast";

type Last = { id: string; status: string; startedAt: string; error?: string | null; state: string; title?: string | null } | null;
type Routine = { id: string; title: string; blurb: string; days: string; hour: number; period: string; ai: boolean; last: Last };
type Employee = { id: string; name: string; role: string; blurb: string; color: string; needsWebsite: boolean; enabled: boolean; routines: Routine[] };
type Overview = { config: { website: string; maxRunsPerDay: number }; fleet: { ok: number; attention: number; total: number; issues: { employee: string; title: string; status: string; error?: string }[] }; employees: Employee[] };
type Run = { id: string; employee: string; routine: string; title?: string; output?: string; status: string; error?: string; state: string; startedAt: string };

const DAYS: Record<string, string> = { "mon-fri": "Weekdays", "mon": "Mondays", "tue": "Tuesdays", "wed": "Wednesdays", "thu": "Thursdays", "fri": "Fridays", "first-weekday": "First working day of the month", "last-weekday": "Last working day of the month" };
const when = (r: Routine) => `${DAYS[r.days] ?? r.days} at ${String(r.hour).padStart(2, "0")}:00`;
const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export function EmployeesView() {
  const bid = businessId();
  const { data: me } = useMe();
  const { data, mutate } = useSWR<Overview>(bid ? `/businesses/${bid}/employees` : null, fetcher, { refreshInterval: 30000 });
  const [filter, setFilter] = useState<"new" | "all">("new");
  const { data: runs, mutate: mutateRuns } = useSWR<Run[]>(bid ? `/businesses/${bid}/employees/runs?limit=40${filter === "new" ? "&state=new" : ""}` : null, fetcher, { refreshInterval: 30000 });
  const [running, setRunning] = useState<string | null>(null);
  const [site, setSite] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const noKey = !!me && me.aiReady === false;

  if (!bid) return <div className="card text-sm text-ink/70">Create or pick a business first, then your AI employees can start working for it.</div>;
  if (!data) return <div className="card text-sm text-ink/60">Loading…</div>;

  const refresh = () => { mutate(); mutateRuns(); };
  async function toggle(e: Employee) {
    try { await api(`/businesses/${bid}/employees/${e.id}`, { method: "PUT", body: JSON.stringify({ enabled: !e.enabled }) }); toast(e.enabled ? `${e.name} is off.` : `${e.name} is on. The first routine runs at its next scheduled time, or press Run now.`, "info"); refresh(); }
    catch (x: any) { toast(x.message, "error"); }
  }
  async function runNow(r: Routine) {
    setRunning(r.id);
    try { const row = await api(`/businesses/${bid}/employees/routines/${r.id}/run`, { method: "POST" }); toast(row?.status === "ok" ? `${r.title}: done. See Deliverables below.` : `${r.title}: ${row?.error ?? row?.status ?? "could not run"}`, row?.status === "ok" ? "info" : "error"); refresh(); }
    catch (x: any) { toast(x.message, "error"); }
    setRunning(null);
  }
  async function saveConfig(b: any) {
    try { await api(`/businesses/${bid}/employees/_all`, { method: "PUT", body: JSON.stringify(b) }); toast("Saved.", "info"); setSite(null); refresh(); }
    catch (x: any) { toast(x.message, "error"); }
  }
  async function mark(id: string, state: "done" | "dismissed" | "new") { await api(`/businesses/${bid}/employees/runs/${id}`, { method: "PATCH", body: JSON.stringify({ state }) }); refresh(); }
  const name = (id: string) => data.employees.find((e) => e.id === id)?.name ?? id;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="card text-sm leading-relaxed text-ink/80">
        <b>Your AI team works on a schedule, even when you are away.</b> Each employee runs a few routines (a morning signal sweep, a weekly content plan, a Friday sales review) using your leads, conversations and bookings, and leaves you a finished draft.
        They <b>only draft</b>. They never send, post, spend money or change anything on their own; you do the last click. Every routine runs once per period, so nothing doubles up.
      </div>

      {noKey && <div className="card border-amber/50 bg-amber/10 text-sm"><AlertTriangle className="mr-2 inline h-4 w-4 text-amber" />No AI key yet, so AI routines will show as blocked. Add a free one (Groq, Google Gemini or OpenRouter) in Settings → AI Keys. Site health and fleet check work without any key.</div>}

      <div className="card flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          {data.fleet.attention ? <AlertTriangle className="h-4 w-4 text-amber" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          <b>{data.fleet.total === 0 ? "No employees switched on yet" : data.fleet.attention ? `${data.fleet.attention} of ${data.fleet.total} routines need attention` : `All ${data.fleet.total} routines healthy`}</b>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <Globe className="h-4 w-4 text-ink/50" />
          <input className="input w-60" placeholder="Your website, e.g. example.com" value={site ?? data.config.website} onChange={(e) => setSite(e.target.value)} />
          {site !== null && site !== data.config.website && <button className="btn btn-primary" onClick={() => saveConfig({ website: site })}>Save</button>}
          <label className="flex items-center gap-1 text-ink/60">Max runs/day
            <select className="input w-20" value={data.config.maxRunsPerDay} onChange={(e) => saveConfig({ maxRunsPerDay: Number(e.target.value) })}>{[3, 6, 12, 20, 40].map((n) => <option key={n}>{n}</option>)}</select>
          </label>
        </div>
        {data.fleet.issues.length > 0 && <ul className="w-full space-y-1 text-xs text-amber-700">{data.fleet.issues.map((i, k) => <li key={k}>• {name(i.employee)} / {i.title}: {i.status === "stale" ? "did not run when expected" : i.error ?? i.status}</li>)}</ul>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {data.employees.map((e) => (
          <div key={e.id} className="card">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: e.color }} />
              <div className="min-w-0 flex-1"><div className="font-semibold">{e.name}</div><div className="text-xs text-ink/60">{e.role}</div></div>
              <button role="switch" aria-checked={e.enabled} onClick={() => toggle(e)} className={`relative h-6 w-11 rounded-full transition ${e.enabled ? "bg-emerald-500" : "bg-ink/20"}`} title={e.enabled ? "Switch off" : "Switch on"}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${e.enabled ? "left-5" : "left-0.5"}`} /></button>
            </div>
            <p className="mt-2 text-sm text-ink/70">{e.blurb}</p>
            {e.needsWebsite && !data.config.website && <p className="mt-1 text-xs text-amber-700">Add your website above so this employee can check it.</p>}
            <ul className="mt-3 divide-y divide-ink/10 text-sm">
              {e.routines.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{r.title} {!r.ai && <span className="ml-1 rounded bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-700">FREE · no AI</span>}</div>
                    <div className="text-xs text-ink/55">{when(r)}{r.last && <> · last: {r.last.status === "ok" ? "done" : r.last.status} {ago(r.last.startedAt)}</>}</div>
                    {r.last && (r.last.status === "failed" || r.last.status === "blocked") && r.last.error && <div className="mt-0.5 text-xs text-amber-700">{r.last.error}</div>}
                  </div>
                  <button className="btn btn-ghost shrink-0" disabled={running === r.id} onClick={() => runNow(r)}>{running === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run now</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-3">
          <h2 className="text-lg font-semibold">Deliverables</h2>
          <div className="flex gap-1 text-xs">{(["new", "all"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 ${filter === f ? "bg-navy text-white" : "bg-ink/10"}`}>{f === "new" ? "To review" : "All"}</button>)}</div>
        </div>
        {!runs?.length ? <div className="card text-sm text-ink/60">{filter === "new" ? "Nothing waiting. Switch an employee on or press Run now on a routine." : "No runs yet."}</div> : (
          <div className="space-y-3">
            {runs.map((r) => (
              <div key={r.id} className="card">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1"><div className="font-medium">{r.title || r.routine}</div><div className="text-xs text-ink/55">{name(r.employee)} · {ago(r.startedAt)}{r.state !== "new" && ` · ${r.state}`}{r.status !== "ok" && ` · ${r.status}`}</div></div>
                  {r.output && <button className="btn btn-ghost" onClick={() => { navigator.clipboard?.writeText(r.output!); toast("Copied.", "info"); }}><Copy className="h-4 w-4" /> Copy</button>}
                  {r.state === "new" ? <>
                    <button className="btn btn-ghost" onClick={() => mark(r.id, "done")}><Check className="h-4 w-4" /> Mark done</button>
                    <button className="btn btn-ghost" onClick={() => mark(r.id, "dismissed")}><X className="h-4 w-4" /> Dismiss</button>
                  </> : <button className="btn btn-ghost" onClick={() => mark(r.id, "new")}>Reopen</button>}
                  {r.output && <button className="btn btn-ghost" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide" : "Read"}</button>}
                </div>
                {r.error && <p className="mt-2 text-xs text-amber-700">{r.error}</p>}
                {open === r.id && r.output && <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-lg bg-ink/5 p-3 text-sm leading-relaxed">{r.output}</pre>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
