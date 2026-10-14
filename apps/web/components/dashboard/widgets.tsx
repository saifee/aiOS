"use client";
import type React from "react";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, BookMarked, Check, CheckCircle2, Circle, Coins, Gauge, Gavel, KeyRound, LayoutList, ListChecks, Plus, Rocket, ShieldCheck, Sparkles, Target, Terminal, Trash2, Users, Wand2, type LucideIcon } from "lucide-react";
import { api, businessId, fetcher } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { toast } from "@/lib/toast";
import { FEATURED, metaFor } from "@/lib/agents";
import { RECIPES } from "@/lib/recipes";

export type WidgetDef = { type: string; title: string; desc: string; icon: LucideIcon; spans: number[]; span: number; Comp: () => React.JSX.Element };

function Panel({ title, icon: Icon, action, children }: { title: string; icon: LucideIcon; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-signalSoft text-signal"><Icon className="h-4 w-4" /></span>{title}</h3>
        {action}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-ink/55">{children}</p>;
const useBiz = () => businessId();

// ── Ask your company ───────────────────────────────────────────
function CommandBar() {
  const bid = useBiz(); const { data: me } = useMe();
  const [cmd, setCmd] = useState(""); const [busy, setBusy] = useState(false); const [reply, setReply] = useState("");
  const ideas = ["Show me which leads are hottest", "Follow up with everyone who got a proposal", "What needs my attention today?"];
  async function run(text = cmd) {
    if (!text.trim() || !bid) return;
    setBusy(true); setReply("");
    try { const r = await api(`/businesses/${bid}/command`, { method: "POST", body: JSON.stringify({ text }) }); setReply(r.reply); setCmd(""); }
    catch (e: any) { toast(e.message, "error"); }
    setBusy(false);
  }
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ink via-[#17306E] to-[#4B3AA8] p-5 text-white shadow-card">
      <h3 className="flex items-center gap-2 text-sm font-bold"><Terminal className="h-4 w-4 text-[#9DB0FF]" />Tell your company what to do</h3>
      <div className="mt-3 flex gap-2">
        <input className="h-11 flex-1 rounded-xl border border-white/20 bg-white/10 px-4 text-sm text-white placeholder:text-white/45 focus:border-white/60 focus:outline-none" placeholder="e.g. Call every school in Jeddah with 500+ students" value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
        <button className="btn h-11 bg-white !text-ink" onClick={() => run()} disabled={busy}>{busy ? "Working…" : "Run"}</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{ideas.map((i) => <button key={i} className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10" onClick={() => run(i)}>{i}</button>)}</div>
      {me && !me.aiReady && <p className="mt-3 text-xs text-amber">No AI key yet. <Link href="/settings#keys" className="underline">Add one</Link> to run commands.</p>}
      {reply && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-white/10 p-3 text-sm text-white/90">{reply}</p>}
    </section>
  );
}

// ── Key numbers ────────────────────────────────────────────────
function Kpis() {
  const bid = useBiz();
  const { data: d } = useSWR(bid ? `/businesses/${bid}/analytics/overview` : null, fetcher);
  const tiles = d ? [
    ["Leads today", d.leadsToday, "#3558F5"], ["Emails sent", d.emailsSent, "#0891B2"], ["WhatsApp sent", d.whatsappSent, "#059669"], ["Open rate", d.openRate + "%", "#D97706"],
    ["Reply rate", d.replyRate + "%", "#DB2777"], ["Interested", d.positiveReplies, "#7C3AED"], ["Meetings booked", d.meetingsBooked, "#0F766E"], ["Deals won", d.dealsWon, "#EA580C"],
  ] : [];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {!d && Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-line" />)}
      {tiles.map(([l, v, c]: any) => (
        <div key={l} className="card relative overflow-hidden py-4">
          <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: c }} />
          <div className="pl-2"><div className="font-display text-3xl font-extrabold">{v}</div><div className="mt-0.5 text-xs text-ink/55">{l}</div></div>
        </div>
      ))}
    </div>
  );
}

// ── Pipeline ───────────────────────────────────────────────────
const STAGES = ["FOUND", "QUALIFIED", "CONTACTED", "REPLIED", "INTERESTED", "MEETING_SCHEDULED", "PROPOSAL_SENT", "NEGOTIATION", "WON"];
function Pipeline() {
  const bid = useBiz();
  const { data } = useSWR(bid ? `/businesses/${bid}/analytics/overview` : null, fetcher);
  const rows = STAGES.map((s) => ({ stage: s.replace(/_/g, " ").toLowerCase(), count: data?.pipeline?.find((p: any) => p.stage === s)?._count ?? 0 }));
  return (
    <Panel title="Pipeline" icon={Activity} action={<Link href="/comms#leads" className="text-xs font-semibold text-signal">Open leads</Link>}>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={rows}><XAxis dataKey="stage" tick={{ fontSize: 10 }} interval={0} angle={-20} height={52} textAnchor="end" /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} /><Tooltip cursor={{ fill: "#E8EDFF" }} /><Bar dataKey="count" fill="#3558F5" radius={[6, 6, 0, 0]} /></BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

// ── Approvals ──────────────────────────────────────────────────
function Approvals() {
  const bid = useBiz();
  const { data, mutate } = useSWR(bid ? `/businesses/${bid}/approvals` : null, fetcher);
  const decide = async (id: string, decision: string) => { try { await api(`/approvals/${id}/decide`, { method: "POST", body: JSON.stringify({ decision }) }); mutate(); } catch (e: any) { toast(e.message, "error"); } };
  return (
    <Panel title="Needs your approval" icon={ShieldCheck} action={data?.length ? <span className="tag bg-amber/15 text-amber">{data.length}</span> : undefined}>
      {!data?.length ? <Empty>Nothing waiting. Agents ask here before sending contracts, spending money or deleting anything.</Empty> :
        <div className="space-y-3">{data.slice(0, 5).map((a: any) => (
          <div key={a.id} className="flex items-center justify-between gap-2 border-b border-line pb-3 last:border-0">
            <div className="min-w-0"><div className="truncate text-sm font-semibold">{a.action.replace(/_/g, " ")}</div><div className="truncate text-xs text-ink/55">{a.summary}</div></div>
            <div className="flex shrink-0 gap-1"><button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => decide(a.id, "rejected")}>Reject</button><button className="btn px-2.5 py-1 text-xs" onClick={() => decide(a.id, "approved")}>Approve</button></div>
          </div>))}</div>}
    </Panel>
  );
}

// ── Morning brief ──────────────────────────────────────────────
function Brief() {
  const bid = useBiz();
  const { data } = useSWR(bid ? `/businesses/${bid}/morning-brief` : null, fetcher);
  return (
    <Panel title="Overnight brief" icon={BookMarked}>
      {!data ? <Empty>Loading…</Empty> : <>
        <div className="mb-3 grid grid-cols-4 gap-2 text-center">{[["New leads", data.newLeads], ["Calls", data.callsDone], ["Interested", data.interested], ["Won", data.wonThisMonth]].map(([l, v]: any) => <div key={l} className="rounded-xl bg-paper py-2"><div className="font-display text-xl font-extrabold">{v}</div><div className="text-[11px] text-ink/50">{l}</div></div>)}</div>
        {data.headlines?.length ? <ul className="space-y-2 text-sm">{data.headlines.slice(0, 4).map((h: string, i: number) => <li key={i} className="flex gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-signal" />{h}</li>)}</ul> : <Empty>Quiet overnight. Run the “Morning briefing” recipe in Playbooks to get a plan for today.</Empty>}
      </>}
    </Panel>
  );
}

// ── Team ───────────────────────────────────────────────────────
function Team() {
  const bid = useBiz();
  const { data } = useSWR(bid ? `/businesses/${bid}/agents` : null, fetcher);
  const list = FEATURED.slice(0, 6).map((r) => (data ?? []).find((a: any) => a.role === r)).filter(Boolean);
  return (
    <Panel title="Your AI team" icon={Users} action={<Link href="/workforce#agents" className="text-xs font-semibold text-signal">See everyone</Link>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((a: any) => { const m = metaFor(a.role, a.displayName); return (
          <Link key={a.role} href="/workforce#agents" className="flex items-center gap-2 rounded-xl p-2.5 text-white transition hover:-translate-y-0.5 hover:shadow-lift" style={{ background: `linear-gradient(135deg, ${m.from}, ${m.to})` }}>
            <m.icon className="h-5 w-5 shrink-0" /><span className="truncate text-xs font-bold">{m.title}</span>
          </Link>); })}
        {!data && <Empty>Loading…</Empty>}
      </div>
    </Panel>
  );
}

// ── Activity ───────────────────────────────────────────────────
function ActivityFeed() {
  const bid = useBiz();
  const { data } = useSWR(bid ? `/businesses/${bid}/agent-runs` : null, fetcher);
  return (
    <Panel title="Agent activity" icon={LayoutList}>
      {!data?.length ? <Empty>No activity yet. Run a recipe or give an agent its first task.</Empty> :
        <ul className="space-y-3">{data.slice(0, 6).map((r: any) => (
          <li key={r.id} className="text-sm"><b>{r.agent.displayName}</b> <span className="text-xs text-ink/45">{new Date(r.startedAt).toLocaleString()} · {r.status.replace(/_/g, " ")}</span>
            {r.output?.text && <p className="line-clamp-2 text-ink/65">{r.output.text}</p>}</li>))}</ul>}
    </Panel>
  );
}

// ── Goals ──────────────────────────────────────────────────────
function Goals() {
  const bid = useBiz();
  const { data, mutate } = useSWR(bid ? `/businesses/${bid}/goals` : null, fetcher);
  const [t, setT] = useState("");
  const add = async () => { if (!t.trim()) return; await api(`/businesses/${bid}/goals`, { method: "POST", body: JSON.stringify({ title: t.trim() }) }); setT(""); mutate(); };
  const upd = async (id: string, progress: number) => { await api(`/goals/${id}`, { method: "PATCH", body: JSON.stringify({ progress }) }); mutate(); };
  return (
    <Panel title="Goals" icon={Target}>
      <div className="space-y-3">
        {(data ?? []).filter((g: any) => g.status !== "done").slice(0, 5).map((g: any) => (
          <div key={g.id}>
            <div className="flex justify-between text-sm"><span className="font-medium">{g.title}</span><span className="text-xs text-ink/50">{g.progress}%</span></div>
            <input type="range" min={0} max={100} step={5} value={g.progress} aria-label={`Progress for ${g.title}`} onChange={(e) => upd(g.id, Number(e.target.value))} className="mt-1 w-full accent-[#3558F5]" />
          </div>))}
        {data && !data.some((g: any) => g.status !== "done") && <Empty>What are the 2–3 things that must happen this quarter? Add them and agents will keep them in mind.</Empty>}
        <div className="flex gap-2"><input className="input" placeholder="Add a goal…" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} /><button className="btn px-3" aria-label="Add goal" onClick={add}><Plus className="h-4 w-4" /></button></div>
      </div>
    </Panel>
  );
}

// ── Decision log ───────────────────────────────────────────────
function Decisions() {
  const bid = useBiz();
  const { data, mutate } = useSWR(bid ? `/businesses/${bid}/decisions` : null, fetcher);
  const [t, setT] = useState(""); const [why, setWhy] = useState("");
  const add = async () => { if (!t.trim()) return; await api(`/businesses/${bid}/decisions`, { method: "POST", body: JSON.stringify({ title: t.trim(), context: why || undefined }) }); setT(""); setWhy(""); mutate(); };
  return (
    <Panel title="Decision log" icon={Gavel}>
      <div className="space-y-2">
        {(data ?? []).slice(0, 4).map((d: any) => (
          <div key={d.id} className="group flex items-start justify-between gap-2 rounded-xl bg-paper p-2.5 text-sm">
            <div><div className="font-semibold">{d.title}</div>{d.context && <div className="text-xs text-ink/55">{d.context}</div>}<div className="mt-0.5 text-[11px] text-ink/40">{new Date(d.createdAt).toLocaleDateString()}</div></div>
            <button aria-label="Delete decision" className="opacity-0 transition group-hover:opacity-100" onClick={async () => { await api(`/decisions/${d.id}`, { method: "DELETE" }); mutate(); }}><Trash2 className="h-3.5 w-3.5 text-ink/40" /></button>
          </div>))}
        {data && !data.length && <Empty>Write down decisions and the reason. Your agents use them so they stop re-asking.</Empty>}
        <input className="input" placeholder="We decided to…" value={t} onChange={(e) => setT(e.target.value)} />
        <div className="flex gap-2"><input className="input" placeholder="Because… (optional)" value={why} onChange={(e) => setWhy(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} /><button className="btn px-3" aria-label="Save decision" onClick={add}><Check className="h-4 w-4" /></button></div>
      </div>
    </Panel>
  );
}

// ── Suggestions ────────────────────────────────────────────────
function Suggestions() {
  const bid = useBiz();
  const { data } = useSWR(bid ? `/businesses/${bid}/analytics/overview` : null, fetcher);
  return (
    <Panel title="Agent suggestions" icon={Wand2}>
      {data?.suggestions?.length ? data.suggestions.slice(0, 3).map((i: any) => (
        <div key={i.id} className="mb-2 rounded-xl bg-paper p-3 text-xs"><span className="tag mb-1">{i.kind.replace(/_/g, " ")}</span><pre className="mt-1 whitespace-pre-wrap font-body text-ink/70">{JSON.stringify(i.data, null, 1).slice(0, 200)}</pre></div>))
        : <Empty>aiOS learns nightly from what worked. Suggestions show up here once there are results to learn from.</Empty>}
    </Panel>
  );
}

// ── AI usage & keys ────────────────────────────────────────────
function Usage() {
  const bid = useBiz(); const { data: me } = useMe();
  const { data } = useSWR(bid ? `/businesses/${bid}/ai-usage` : null, fetcher);
  const max = Math.max(1, ...(data?.byAgent ?? []).map((a: any) => a.tokens));
  return (
    <Panel title="AI usage (30 days)" icon={Coins} action={<Link href="/settings#keys" className="text-xs font-semibold text-signal">{me?.aiKeys ?? 0} key{me?.aiKeys === 1 ? "" : "s"}</Link>}>
      {!data ? <Empty>Loading…</Empty> : <>
        <div className="mb-3 flex gap-6"><div><div className="font-display text-2xl font-extrabold">{data.runs}</div><div className="text-xs text-ink/50">agent runs</div></div><div><div className="font-display text-2xl font-extrabold">{(data.tokens / 1000).toFixed(1)}k</div><div className="text-xs text-ink/50">tokens used</div></div></div>
        <div className="space-y-2">{data.byAgent.slice(0, 4).map((a: any) => <div key={a.agent}><div className="flex justify-between text-xs"><span>{a.agent}</span><span className="text-ink/50">{(a.tokens / 1000).toFixed(1)}k</span></div><div className="mt-0.5 h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-signal" style={{ width: `${(a.tokens / max) * 100}%` }} /></div></div>)}</div>
        {!data.runs && <Empty>No runs yet.</Empty>}
      </>}
    </Panel>
  );
}

// ── Quick recipes ──────────────────────────────────────────────
function QuickRecipes() {
  return (
    <Panel title="Quick recipes" icon={Rocket} action={<Link href="/playbooks" className="text-xs font-semibold text-signal">All recipes</Link>}>
      <div className="grid gap-2 sm:grid-cols-2">
        {RECIPES.slice(0, 4).map((r) => { const m = metaFor(r.role); return (
          <Link key={r.id} href="/playbooks" className="flex items-center gap-3 rounded-xl border border-line p-3 transition hover:border-signal">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${m.from}, ${m.to})` }}><m.icon className="h-4 w-4" /></span>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold">{r.title}</span><span className="block truncate text-xs text-ink/50">{r.blurb}</span></span>
          </Link>); })}
      </div>
    </Panel>
  );
}

// ── Plan ───────────────────────────────────────────────────────
function PlanMeters() {
  const { data: me } = useMe();
  const { data: sub } = useSWR("/billing/subscription", fetcher);
  return (
    <Panel title={`${me?.planName ?? ""} plan`} icon={Gauge} action={<Link href="/settings#plan" className="text-xs font-semibold text-signal">{me?.byokOnly ? "Upgrade" : "Manage"}</Link>}>
      {me?.byokOnly && <p className="mb-3 rounded-xl bg-signalSoft p-3 text-xs text-ink/70">Free runs on your own AI keys. Upgrade to add managed AI, outreach and calls.</p>}
      {sub && ["leads", "outreach", "calls"].map((k) => { const lim = sub.limits[k]; const used = sub.usage[k] ?? 0; return (
        <div key={k} className="mb-2"><div className="flex justify-between text-xs capitalize text-ink/60"><span>{k}</span><span>{lim === 0 ? "Paid plans" : `${used} / ${lim >= 1e9 ? "∞" : lim}`}</span></div>
          <div className="mt-0.5 h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-signal" style={{ width: lim > 0 ? `${Math.min(100, (used / lim) * 100)}%` : "0%" }} /></div></div>); })}
    </Panel>
  );
}

// ── Get started ────────────────────────────────────────────────
function GetStarted() {
  const bid = useBiz(); const { data: me } = useMe();
  const { data: runs } = useSWR(bid ? `/businesses/${bid}/agent-runs` : null, fetcher);
  const steps = [
    { done: !!bid, label: "Tell aiOS about your business", href: "/settings#business" },
    { done: !!me?.aiReady, label: "Add an AI key (free options available)", href: "/settings#keys" },
    { done: (runs?.length ?? 0) > 0, label: "Run your first recipe", href: "/playbooks" },
  ];
  const n = steps.filter((s) => s.done).length;
  return (
    <Panel title="Get started" icon={ListChecks} action={<span className="text-xs font-semibold text-ink/50">{n}/3</span>}>
      <div className="mb-3 h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-ok transition-all" style={{ width: `${(n / 3) * 100}%` }} /></div>
      <ul className="space-y-1.5">{steps.map((s) => (
        <li key={s.label}><Link href={s.href} className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm hover:bg-paper">{s.done ? <CheckCircle2 className="h-4 w-4 text-ok" /> : <Circle className="h-4 w-4 text-ink/30" />}<span className={s.done ? "text-ink/45 line-through" : "font-medium"}>{s.label}</span></Link></li>))}</ul>
    </Panel>
  );
}

export const WIDGETS: WidgetDef[] = [
  { type: "command", title: "Ask your company", desc: "Give an order in plain language", icon: Terminal, spans: [8, 12], span: 12, Comp: CommandBar },
  { type: "start", title: "Get started", desc: "Setup checklist", icon: ListChecks, spans: [4, 6], span: 4, Comp: GetStarted },
  { type: "kpis", title: "Key numbers", desc: "Leads, outreach, replies, deals", icon: Gauge, spans: [8, 12], span: 12, Comp: Kpis },
  { type: "pipeline", title: "Pipeline", desc: "Leads by stage", icon: Activity, spans: [6, 8, 12], span: 8, Comp: Pipeline },
  { type: "approvals", title: "Needs your approval", desc: "Human-in-the-loop queue", icon: ShieldCheck, spans: [4, 6, 8], span: 4, Comp: Approvals },
  { type: "brief", title: "Overnight brief", desc: "What happened while you were away", icon: BookMarked, spans: [4, 6, 8], span: 6, Comp: Brief },
  { type: "team", title: "Your AI team", desc: "Your colourful crew at a glance", icon: Users, spans: [4, 6, 8, 12], span: 6, Comp: Team },
  { type: "recipes", title: "Quick recipes", desc: "One-click routines", icon: Rocket, spans: [6, 8, 12], span: 6, Comp: QuickRecipes },
  { type: "goals", title: "Goals", desc: "Quarter priorities with progress", icon: Target, spans: [4, 6, 8], span: 4, Comp: Goals },
  { type: "decisions", title: "Decision log", desc: "What you decided, and why", icon: Gavel, spans: [4, 6, 8], span: 4, Comp: Decisions },
  { type: "activity", title: "Agent activity", desc: "Latest runs and results", icon: LayoutList, spans: [4, 6, 8, 12], span: 6, Comp: ActivityFeed },
  { type: "usage", title: "AI usage", desc: "Tokens by agent, keys connected", icon: Coins, spans: [4, 6], span: 4, Comp: Usage },
  { type: "suggestions", title: "Agent suggestions", desc: "Nightly learning insights", icon: Wand2, spans: [4, 6, 8], span: 4, Comp: Suggestions },
  { type: "plan", title: "Plan & limits", desc: "Usage against your plan", icon: KeyRound, spans: [4, 6], span: 4, Comp: PlanMeters },
];
export const widgetDef = (t: string) => WIDGETS.find((w) => w.type === t);
