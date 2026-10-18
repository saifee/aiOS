"use client";
import { useState } from "react";
import { ListChecks, Play, Sparkles } from "lucide-react";
import { PageHeader, Tabs, TabDef } from "@/components/Tabs";
import { useHashTab, useIsPersonal } from "@/lib/hooks";
import { api, businessId } from "@/lib/api";
import { toast } from "@/lib/toast";
import { RECIPES } from "@/lib/recipes";
import { metaFor } from "@/lib/agents";
import { SopsView } from "@/components/views/SopsView";

const IDS = ["recipes", "sops"] as const;
type Id = (typeof IDS)[number];
const TABS: TabDef<Id>[] = [{ id: "recipes", label: "Recipes", icon: Sparkles }, { id: "sops", label: "SOPs", icon: ListChecks }];

export default function Playbooks() {
  const personal = useIsPersonal();
  const [tab, setTab] = useHashTab(IDS, "recipes");
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; text: string } | null>(null);

  async function run(id: string) {
    const r = RECIPES.find((x) => x.id === id)!;
    const bid = businessId();
    if (!bid) return toast("Create your business first in Settings.", "error");
    setRunning(id);
    try {
      const out = await api(`/businesses/${bid}/agents/${r.role}/run`, { method: "POST", body: JSON.stringify({ input: { task: r.prompt } }) });
      setResult({ title: r.title, text: out.awaitingApproval ? `${out.text}\n\n(Some actions are waiting for your approval in the Command center.)` : out.text });
    } catch (e: any) { toast(e.message, "error"); }
    setRunning(null);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Playbooks" subtitle="Ready-made routines your agents can run in one click, and the standard procedures your company follows." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "sops" && <SopsView />}
      {tab === "recipes" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RECIPES.filter((r) => !!r.personal === personal).map((r) => {
              const m = metaFor(r.role); const Icon = m.icon;
              return (
                <div key={r.id} className="card flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${m.from}, ${m.to})` }}><Icon className="h-5 w-5" /></span>
                    <span className="tag">{r.tag}</span>
                  </div>
                  <h3 className="mt-3 text-base font-bold">{r.title}</h3>
                  <p className="mt-1 flex-1 text-sm text-ink/60">{r.blurb}</p>
                  <div className="mt-4 flex items-center justify-between"><span className="text-xs text-ink/50">by {m.title}</span>
                    <button className="btn px-3 py-1.5" disabled={running !== null} onClick={() => run(r.id)}><Play className="h-3.5 w-3.5" />{running === r.id ? "Running…" : "Run"}</button></div>
                </div>
              );
            })}
          </div>
          {result && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setResult(null)}>
              <div className="card max-h-[80vh] w-full max-w-2xl overflow-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <h2 className="text-lg font-bold">{result.title}</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{result.text || "Finished — nothing to report."}</p>
                <button className="btn mt-4" onClick={() => setResult(null)}>Close</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
