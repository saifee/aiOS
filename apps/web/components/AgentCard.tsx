"use client";
import { ArrowUpRight } from "lucide-react";
import { metaFor } from "@/lib/agents";

/** A colourful team-member card. `compact` is used for the long tail of specialists. */
export function AgentCard({ agent, onAssign, compact = false }: { agent: { role: string; displayName: string; status?: string; lastRun?: string | null; tools?: string[] }; onAssign: () => void; compact?: boolean }) {
  const m = metaFor(agent.role, agent.displayName);
  const Icon = m.icon;
  const active = agent.status === "active";
  return (
    <button onClick={onAssign} aria-label={`Give ${m.title} a task`}
      className={`group relative flex flex-col overflow-hidden rounded-2xl text-left text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lift ${compact ? "p-4" : "min-h-[11rem] p-5"}`}
      style={{ background: `linear-gradient(135deg, ${m.from}, ${m.to})` }}>
      <span className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
      <span className="pointer-events-none absolute -bottom-10 right-8 h-24 w-24 rounded-full bg-white/10" />
      <div className="relative flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur"><Icon className="h-5 w-5" /></span>
        <span className="flex items-center gap-1.5 rounded-full bg-black/15 px-2 py-0.5 text-[11px] font-medium">
          <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-300" : "bg-white/60"}`} />{active ? "Working" : agent.lastRun ? "Ready" : "Idle"}
        </span>
      </div>
      <div className="relative mt-4 font-display text-lg font-bold leading-tight">{m.title}</div>
      {!compact && <p className="relative mt-1 flex-1 text-sm leading-snug text-white/85">{m.blurb}</p>}
      <div className="relative mt-3 flex items-center gap-1 text-xs font-semibold text-white/90">Give a task <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></div>
    </button>
  );
}
