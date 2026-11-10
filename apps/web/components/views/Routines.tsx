"use client";
import useSWR from "swr";
import { createContext, useContext, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Copy, Globe, Loader2, Play, X } from "lucide-react";
import { api, fetcher, businessId } from "@/lib/api";
import { toast } from "@/lib/toast";

/** Scheduled routines (the former "AI Employees") shown on the agents they belong to. */
export const ROLE_FOR: Record<string, string> = { gtm: "growth", seo: "marketing", social: "marketing", ads: "marketing", webdev: "cto", sales: "sales", csat: "customer_success", cos: "ceo_assistant" };

type Last = { id: string; status: string; startedAt: string; error?: string | null; state: string; title?: string | null } | null;
export type Routine = { id: string; title: string; blurb: string; days: string; hour: number; period: string; ai: boolean; last: Last };
export type Employee = { id: string; name: string; role: string; blurb: string; color: string; needsWebsite: boolean; enabled: boolean; routines: Routine[] };
type Overview = { config: { website: string; maxRunsPerDay: number }; fleet: { ok: number; attention: number; total: number; issues: { employee: string; title: string; status: string; error?: string }[] }; employees: Employee[] };
type Run = { id: string; employee: string; routine: string; title?: string; output?: string; status: string; error?: string; state: string; startedAt: string };

const DAYS: Record<string, string> = { "mon-fri": "Weekdays", mon: "Mondays", tue: "Tuesdays", wed: "Wednesdays", thu: "Thursdays", fri: "Fridays", "first-weekday": "First working day of the month", "last-weekday": "Last working day of the month" };
const when = (r: Routine) => `${DAYS[r.days] ?? r.days} at ${String(r.hour).padStart(2, "0")}:00`;
const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export function useRoutines() {
  const bid = businessId();
  const ov = useSWR<Overview>(bid ? `/businesses/${bid}/employees` : null, fetcher, { refreshInterval: 30000 });
  const [filter, setFilter] = useState<"new" | "all">("new");
  const runs = useSWR<Run[]>(bid ? `/businesses/${bid}/employees/runs?limit=40${filter === "new" ? "&state=new" : ""}` : null, fetcher, { refreshInterval: 30000 });
  const refresh = () => { ov.mutate(); runs.mutate(); };
  return { bid, data: ov.data, runs: runs.data, filter, setFilter, refresh };
}
const Ctx = createContext<ReturnType<typeof useRoutines> | null>(null);
export const RoutinesProvider = Ctx.Provider;
const useR = () => useContext(Ctx)!;

/** Fleet health, website and daily cap. */
export function RoutinesBar() {
  const { bid, data, refresh } = useR();
  const [site, setSite] = useState<string | null>(null);
  if (!data) return null;
  async function save(b: any) {
    try { await api(`/businesses/${bid}/employees/_all`, { method: "PUT", body: JSON.stringify(b) }); toast("Saved.", "info"); setSite(null); refresh(); } catch (x: any) { toast(x.message, "error"); }
  }
  const nm = (id: string) => data.employees.find((e) => e.id === id)?.name ?? id;
  return (
    <div className="card flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2 text-sm">
        {data.fleet.attention ? <AlertTriangle className="h-4 w-4 text-amber" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        <b>{data.fleet.total === 0 ? "Scheduled routines: none switched on yet" : data.fleet.attention ? `${data.fleet.attention} of ${data.fleet.total} scheduled routines need attention` : `All ${data.fleet.total} scheduled routines healthy`}</b>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
        <Globe className="h-4 w-4 text-ink/50" />
        <input className="input w-60" placeholder="Your website, e.g. example.com" value={site ?? data.config.website} onChange={(e) => setSite(e.target.value)} />
        {site !== null && site !== data.config.website && <button className="btn btn-primary" onClick={() => save({ website: site })}>Save</button>}
        <label className="flex items-center gap-1 text-ink/60">Max runs/day
          <select className="input w-20" value={data.config.maxRunsPerDay} onChange={(e) => save({ maxRunsPerDay: Number(e.target.value) })}>{[3, 6, 12, 20, 40].map((n) => <option key={n}>{n}</option>)}</select>
        </label>
      </div>
      {data.fleet.issues.length > 0 && <ul className="w-full space-y-1 text-xs text-amber-700">{data.fleet.issues.map((i, k) => <li key={k}>• {nm(i.employee)} / {i.title}: {i.status === "stale" ? "did not run when expected" : i.error ?? i.status}</li>)}</ul>}
    </div>
  );
}

/** The scheduled routines that belong to one agent (shown right under its card). */
export function RoutinePanel({ role }: { role: string }) {
  const { bid, data, refresh } = useR();
  const [running, setRunning] = useState<string | null>(null);
  const [openP, setOpenP] = useState(false);
  const mine = data?.employees.filter((e) => ROLE_FOR[e.id] === role) ?? [];
  if (!mine.length) return null;
  const on = mine.filter((e) => e.enabled).length;
  async function toggle(e: Employee) {
    try { await api(`/businesses/${bid}/employees/${e.id}`, { method: "PUT", body: JSON.stringify({ enabled: !e.enabled }) }); toast(e.enabled ? `${e.name} is off.` : `${e.name} is on. Its first routine runs at the next scheduled time, or press Run now.`, "info"); refresh(); } catch (x: any) { toast(x.message, "error"); }
  }
  async function run(r: Routine) {
    setRunning(r.id);
    try { const row = await api(`/businesses/${bid}/employees/routines/${r.id}/run`, { method: "POST" }); toast(row?.status === "ok" ? `${r.title}: done. See Scheduled work below.` : `${r.title}: ${row?.error ?? row?.status ?? "could not run"}`, row?.status === "ok" ? "info" : "error"); refresh(); } catch (x: any) { toast(x.message, "error"); }
    setRunning(null);
  }
  return (
    <div className="mt-1 rounded-xl border border-line bg-white text-sm shadow-card">
      <button className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => setOpenP(!openP)} aria-expanded={openP}>
        <span className={`h-2 w-2 rounded-full ${on ? "bg-emerald-500" : "bg-ink/25"}`} />
        <span className="flex-1 text-xs font-semibold">Scheduled routines · {on ? `${on} of ${mine.length} on` : "off"}</span>
        <ChevronDown className={`h-4 w-4 text-ink/50 transition ${openP ? "rotate-180" : ""}`} />
      </button>
      {openP && mine.map((e) => (
        <div key={e.id} className="border-t border-line px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1"><div className="font-medium">{e.name}</div><div className="text-xs text-ink/55">{e.blurb}</div></div>
            <button role="switch" aria-checked={e.enabled} onClick={() => toggle(e)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${e.enabled ? "bg-emerald-500" : "bg-ink/20"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${e.enabled ? "left-5" : "left-0.5"}`} /></button>
          </div>
          <ul className="mt-2 space-y-2">
            {e.routines.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{r.title} {!r.ai && <span className="ml-1 rounded bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-700">FREE · no AI</span>}</div>
                  <div className="text-xs text-ink/55">{when(r)}{r.last && <> · last: {r.last.status === "ok" ? "done" : r.last.status} {ago(r.last.startedAt)}</>}</div>
                  {r.last && (r.last.status === "failed" || r.last.status === "blocked") && r.last.error && <div className="text-xs text-amber-700">{r.last.error}</div>}
                </div>
                <button className="btn btn-ghost shrink-0" disabled={running === r.id} onClick={() => run(r)}>{running === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run</button>
              </li>
            ))}
          </ul>
          {e.needsWebsite && !data?.config.website && <p className="mt-1 text-xs text-amber-700">Add your website in the bar above so this can check it.</p>}
        </div>
      ))}
    </div>
  );
}

/** Drafts the scheduled routines produced, to review. */
export function ScheduledWork() {
  const { bid, data, runs, filter, setFilter, refresh } = useR();
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return null;
  const nm = (id: string) => data.employees.find((e) => e.id === id)?.name ?? id;
  async function mark(id: string, state: "done" | "dismissed" | "new") { await api(`/businesses/${bid}/employees/runs/${id}`, { method: "PATCH", body: JSON.stringify({ state }) }); refresh(); }
  return (
    <section>
      <div className="mb-2 flex items-center gap-3">
        <h3 className="text-sm font-semibold">Scheduled work to review</h3>
        <div className="flex gap-1 text-xs">{(["new", "all"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 ${filter === f ? "bg-navy text-white" : "bg-ink/10"}`}>{f === "new" ? "To review" : "All"}</button>)}</div>
      </div>
      <p className="mb-3 text-xs text-ink/55">Scheduled routines only draft. They never send, post or spend; you do the last click.</p>
      {!runs?.length ? <div className="card text-sm text-ink/60">{filter === "new" ? "Nothing waiting. Open an agent's Scheduled routines and switch one on, or press Run." : "No runs yet."}</div> : (
        <div className="space-y-3">
          {runs.map((r) => (
            <div key={r.id} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1"><div className="font-medium">{r.title || r.routine}</div><div className="text-xs text-ink/55">{nm(r.employee)} · {ago(r.startedAt)}{r.state !== "new" && ` · ${r.state}`}{r.status !== "ok" && ` · ${r.status}`}</div></div>
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
    </section>
  );
}
