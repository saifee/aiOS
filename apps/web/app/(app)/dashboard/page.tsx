"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical, LayoutGrid, Maximize2, Pencil, Plus, RotateCcw, Trash2, X, Check } from "lucide-react";
import { api, businessId } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { WIDGETS, widgetDef } from "@/components/dashboard/widgets";

type Item = { id: string; type: string; span: number };
type Board = { id: string; name: string; items: Item[] };
type State = { boards: Board[]; active: string };

const uid = () => Math.random().toString(36).slice(2, 9);
const mk = (types: string[]): Item[] => types.map((t) => ({ id: uid(), type: t, span: widgetDef(t)!.span }));
const PRESETS: Record<string, { name: string; blurb: string; types: string[] }> = {
  overview: { name: "Overview", blurb: "A bit of everything", types: ["command", "kpis", "pipeline", "approvals", "brief", "team", "start", "goals", "usage"] },
  executive: { name: "Executive", blurb: "Priorities, decisions and approvals", types: ["command", "brief", "approvals", "goals", "decisions", "usage"] },
  sales: { name: "Sales", blurb: "Pipeline, outreach and the team", types: ["kpis", "pipeline", "recipes", "team", "suggestions"] },
  operations: { name: "Operations", blurb: "What agents are doing and what it costs", types: ["approvals", "activity", "usage", "plan", "recipes"] },
};
const fresh = (): State => { const b = { id: uid(), name: "Overview", items: mk(PRESETS.overview.types) }; return { boards: [b], active: b.id }; };
const LS = "aios_dashboards_v1";

export default function Dashboard() {
  const { data: me } = useMe();
  const [st, setSt] = useState<State | null>(null);
  const [edit, setEdit] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [rename, setRename] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const loaded = useRef(false);
  const saveT = useRef<any>(null);

  // load: local cache first (instant), then the account copy (follows you across devices)
  useEffect(() => {
    let local: State | null = null;
    try { local = JSON.parse(localStorage.getItem(LS) || "null"); } catch { /* ignore */ }
    setSt(local?.boards?.length ? local : fresh());
    api("/me/prefs/dashboards").then((r) => { if (r.value?.boards?.length) { setSt(r.value); try { localStorage.setItem(LS, JSON.stringify(r.value)); } catch { /* ignore */ } } }).catch(() => {}).finally(() => { loaded.current = true; });
    if (window.location.hash === "#remix") setEdit(true);
  }, []);

  const commit = useCallback((next: State) => {
    setSt(next);
    try { localStorage.setItem(LS, JSON.stringify(next)); } catch { /* ignore */ }
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => api("/me/prefs/dashboards", { method: "PUT", body: JSON.stringify({ value: next }) }).catch(() => {}), 600);
  }, []);

  if (!st) return null;
  const board = st.boards.find((b) => b.id === st.active) ?? st.boards[0];
  const setItems = (items: Item[]) => commit({ ...st, boards: st.boards.map((b) => (b.id === board.id ? { ...b, items } : b)) });
  const used = new Set(board.items.map((i) => i.type));
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = (me?.user.name || "").split(" ")[0];

  const move = (id: string, d: number) => { const a = [...board.items]; const i = a.findIndex((x) => x.id === id); const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setItems(a); };
  const resize = (id: string) => setItems(board.items.map((x) => { if (x.id !== id) return x; const s = widgetDef(x.type)!.spans; return { ...x, span: s[(s.indexOf(x.span) + 1) % s.length] }; }));
  const drop = (over: string) => { if (!drag || drag === over) return; const a = [...board.items]; const from = a.findIndex((x) => x.id === drag); const to = a.findIndex((x) => x.id === over); const [m] = a.splice(from, 1); a.splice(to, 0, m); setItems(a); };
  const addBoard = (key?: string) => { const p = key ? PRESETS[key] : { name: "New dashboard", types: ["kpis"] }; const b = { id: uid(), name: p.name, items: mk(p.types) }; commit({ boards: [...st.boards, b], active: b.id }); setEdit(true); };
  const spanCls = (s: number) => ({ 4: "lg:col-span-4", 6: "lg:col-span-6", 8: "lg:col-span-8", 12: "lg:col-span-12" } as Record<number, string>)[s] ?? "lg:col-span-6";
  const sizeName = (s: number) => ({ 4: "Small", 6: "Medium", 8: "Large", 12: "Full width" } as Record<number, string>)[s];

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">{hello}{first ? `, ${first}` : ""}</h1>
          <p className="mt-1 text-sm text-ink/60">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · {me?.tenant.name}</p>
        </div>
        <div className="flex gap-2">
          {edit && <button className="btn-ghost" onClick={() => setGallery(true)}><Plus className="h-4 w-4" />Add widgets</button>}
          <button className={edit ? "btn" : "btn-ghost"} onClick={() => { setEdit(!edit); setGallery(false); }}>{edit ? <><Check className="h-4 w-4" />Done</> : <><LayoutGrid className="h-4 w-4" />Remix</>}</button>
        </div>
      </header>

      <div role="tablist" className="mb-5 flex flex-wrap items-center gap-1.5">
        {st.boards.map((b) => (
          <div key={b.id} className={`flex items-center rounded-full border text-sm font-semibold ${b.id === board.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/65 hover:text-ink"}`}>
            {rename === b.id ? (
              <input autoFocus className="w-32 rounded-full bg-transparent px-3 py-1.5 text-sm outline-none" defaultValue={b.name}
                onBlur={(e) => { commit({ ...st, boards: st.boards.map((x) => (x.id === b.id ? { ...x, name: e.target.value.trim() || x.name } : x)) }); setRename(null); }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
            ) : <button role="tab" aria-selected={b.id === board.id} className="px-4 py-1.5" onClick={() => commit({ ...st, active: b.id })} onDoubleClick={() => edit && setRename(b.id)}>{b.name}</button>}
            {edit && b.id === board.id && rename !== b.id && (
              <span className="mr-1 flex">
                <button aria-label="Rename dashboard" className="p-1.5" onClick={() => setRename(b.id)}><Pencil className="h-3.5 w-3.5" /></button>
                {st.boards.length > 1 && <button aria-label="Delete dashboard" className="p-1.5" onClick={() => { if (confirm(`Delete “${b.name}”?`)) { const rest = st.boards.filter((x) => x.id !== b.id); commit({ boards: rest, active: rest[0].id }); } }}><Trash2 className="h-3.5 w-3.5" /></button>}
              </span>
            )}
          </div>
        ))}
        {edit && <button className="flex items-center gap-1 rounded-full border border-dashed border-ink/30 px-3 py-1.5 text-sm font-semibold text-ink/60 hover:border-signal hover:text-signal" onClick={() => setGallery(true)}><Plus className="h-4 w-4" />New dashboard</button>}
      </div>

      {edit && <div className="mb-4 rounded-xl border border-signal/30 bg-signalSoft px-4 py-2.5 text-sm text-ink/75">Remix mode: drag widgets (or use the arrows) to reorder, resize them, remove what you don't need, and add more from the gallery. Changes save automatically to your account.</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {board.items.map((it, idx) => {
          const def = widgetDef(it.type); if (!def) return null; const C = def.Comp;
          return (
            <div key={it.id} className={`relative min-w-0 ${spanCls(it.span)} ${edit ? "rounded-2xl outline outline-2 outline-dashed outline-signal/40" : ""} ${drag === it.id ? "opacity-40" : ""}`}
              draggable={edit} onDragStart={() => setDrag(it.id)} onDragEnd={() => setDrag(null)} onDragOver={(e) => edit && e.preventDefault()} onDrop={() => drop(it.id)}>
              {edit && (
                <div className="absolute -top-3 left-3 right-3 z-10 flex items-center justify-between rounded-full bg-ink px-2 py-1 text-white shadow-lift">
                  <span className="flex cursor-grab items-center gap-1 text-xs font-semibold"><GripVertical className="h-4 w-4" />{def.title}</span>
                  <span className="flex items-center">
                    <button aria-label="Move earlier" className="p-1 disabled:opacity-30" disabled={idx === 0} onClick={() => move(it.id, -1)}><ChevronLeft className="h-4 w-4" /></button>
                    <button aria-label="Move later" className="p-1 disabled:opacity-30" disabled={idx === board.items.length - 1} onClick={() => move(it.id, 1)}><ChevronRight className="h-4 w-4" /></button>
                    {def.spans.length > 1 && <button aria-label="Change size" title={`Size: ${sizeName(it.span)}`} className="flex items-center gap-1 p-1 text-[11px]" onClick={() => resize(it.id)}><Maximize2 className="h-3.5 w-3.5" />{sizeName(it.span)}</button>}
                    <button aria-label="Remove widget" className="p-1" onClick={() => setItems(board.items.filter((x) => x.id !== it.id))}><X className="h-4 w-4" /></button>
                  </span>
                </div>
              )}
              <div className={edit ? "pointer-events-none select-none pt-4" : "h-full"}><C /></div>
            </div>
          );
        })}
        {board.items.length === 0 && (
          <div className="card col-span-full py-14 text-center"><p className="font-display text-xl font-bold">This dashboard is empty</p><p className="mt-1 text-sm text-ink/60">Add the widgets you want to see here.</p><button className="btn mt-4" onClick={() => { setEdit(true); setGallery(true); }}>Add widgets</button></div>
        )}
      </div>

      {gallery && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={() => setGallery(false)}>
          <aside className="h-full w-full max-w-md overflow-auto bg-white p-5 shadow-lift" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Widget gallery">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Add to “{board.name}”</h2><button aria-label="Close" onClick={() => setGallery(false)}><X /></button></div>
            <div className="space-y-2">
              {WIDGETS.map((w) => (
                <div key={w.type} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-signalSoft text-signal"><w.icon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1"><div className="text-sm font-bold">{w.title}</div><div className="text-xs text-ink/55">{w.desc}</div></div>
                  <button className="btn-ghost px-3 py-1.5 text-xs" disabled={used.has(w.type)} onClick={() => setItems([...board.items, ...mk([w.type])])}>{used.has(w.type) ? "Added" : "Add"}</button>
                </div>
              ))}
            </div>
            <h3 className="mb-2 mt-6 text-sm font-bold">Start a new dashboard from a template</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(PRESETS).map(([k, p]) => <button key={k} className="rounded-xl border border-line p-3 text-left hover:border-signal" onClick={() => { addBoard(k); setGallery(false); }}><div className="text-sm font-bold">{p.name}</div><div className="text-xs text-ink/55">{p.blurb}</div></button>)}
            </div>
            <button className="btn-ghost mt-6 w-full" onClick={() => { if (confirm("Reset all dashboards to the default layout?")) { commit(fresh()); setGallery(false); } }}><RotateCcw className="h-4 w-4" />Reset everything</button>
          </aside>
        </div>
      )}
    </div>
  );
}
