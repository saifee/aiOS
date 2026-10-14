"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { CornerDownLeft, FileText, KeyRound, Search, Sparkles, UserRound, Users2, LayoutGrid } from "lucide-react";
import { api, businessId, fetcher } from "@/lib/api";
import { NAV, SUBPAGES } from "@/lib/nav";
import { metaFor } from "@/lib/agents";

type Item = { key: string; group: string; label: string; sub?: string; icon: any; run: () => void };

/** Microsoft-style universal search: pages, agents, leads and "ask aiOS" in one box. Ctrl/⌘+K to focus. */
export function SearchBox() {
  const router = useRouter();
  const bid = businessId();
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false); const [sel, setSel] = useState(0);
  const [leads, setLeads] = useState<any[]>([]);
  const box = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null);
  const { data: agents } = useSWR(bid ? `/businesses/${bid}/agents` : null, fetcher, { revalidateOnFocus: false });

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); setOpen(true); } };
    const click = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", key); document.addEventListener("mousedown", click);
    return () => { window.removeEventListener("keydown", key); document.removeEventListener("mousedown", click); };
  }, []);

  useEffect(() => {
    if (!bid || q.trim().length < 2) { setLeads([]); return; }
    const t = setTimeout(() => api(`/businesses/${bid}/leads?take=5&search=${encodeURIComponent(q.trim())}`).then(setLeads).catch(() => setLeads([])), 250);
    return () => clearTimeout(t);
  }, [q, bid]);

  const go = (href: string) => { setOpen(false); setQ(""); router.push(href); if (href.includes("#")) setTimeout(() => window.dispatchEvent(new HashChangeEvent("hashchange")), 50); };

  const items: Item[] = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hit = (s: string) => !t || s.toLowerCase().includes(t);
    const out: Item[] = [];
    if (t.length > 2) out.push({ key: "ask", group: "Ask aiOS", label: `Ask: “${q.trim()}”`, sub: "Send to your CEO Assistant", icon: Sparkles, run: () => { try { sessionStorage.setItem("aios_cmd", q.trim()); } catch { /* ignore */ } go("/workforce#command"); } });
    NAV.filter((n) => hit(n.label + " " + n.keywords)).forEach((n) => out.push({ key: n.href, group: "Pages", label: n.label, sub: n.hint, icon: n.icon, run: () => go(n.href) }));
    if (t) SUBPAGES.filter((n) => hit(n.label + " " + n.keywords)).forEach((n) => out.push({ key: n.href, group: "Pages", label: n.label, icon: n.label === "AI keys" ? KeyRound : FileText, run: () => go(n.href) }));
    (agents ?? []).filter((a: any) => t && hit(a.displayName + " " + a.department + " " + a.role)).slice(0, 5).forEach((a: any) => out.push({ key: "a" + a.role, group: "Agents", label: metaFor(a.role, a.displayName).title, sub: a.department, icon: Users2, run: () => go("/workforce#agents") }));
    leads.forEach((l) => out.push({ key: "l" + l.id, group: "Leads", label: l.companyName, sub: [l.city, l.stage?.toLowerCase().replace(/_/g, " ")].filter(Boolean).join(" · "), icon: UserRound, run: () => go("/comms#leads") }));
    if (!t) out.push({ key: "remix", group: "Quick actions", label: "Remix my dashboard", sub: "Choose which widgets you see", icon: LayoutGrid, run: () => go("/dashboard#remix") });
    return out.slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, agents, leads]);

  useEffect(() => setSel(0), [q]);
  const groups = items.reduce<Record<string, Item[]>>((a, i) => ((a[i.group] ??= []).push(i), a), {});

  return (
    <div ref={box} className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/45" />
      <input ref={input} value={q} role="combobox" aria-expanded={open} aria-controls="aios-search" aria-label="Search aiOS"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          else if (e.key === "Enter") items[sel]?.run();
          else if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
        }}
        placeholder="Search pages, agents, leads — or ask aiOS anything"
        className="h-10 w-full rounded-full border border-line bg-white pl-10 pr-16 text-sm shadow-sm placeholder:text-ink/40 focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/20" />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-paper px-1.5 py-0.5 text-[10px] font-medium text-ink/50 sm:block">Ctrl K</kbd>
      {open && items.length > 0 && (
        <div id="aios-search" role="listbox" className="absolute left-0 right-0 top-12 z-50 max-h-[26rem] overflow-auto rounded-2xl border border-line bg-white p-2 shadow-lift">
          {Object.entries(groups).map(([g, list]) => (
            <div key={g} className="mb-1">
              <div className="px-3 py-1 text-xs font-semibold text-ink/45">{g}</div>
              {list.map((it) => {
                const idx = items.indexOf(it); const Icon = it.icon;
                return (
                  <button key={it.key} role="option" aria-selected={idx === sel} onMouseEnter={() => setSel(idx)} onClick={it.run}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${idx === sel ? "bg-signalSoft" : ""}`}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper text-signal"><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{it.label}</span>{it.sub && <span className="block truncate text-xs text-ink/50">{it.sub}</span>}</span>
                    {idx === sel && <CornerDownLeft className="h-3.5 w-3.5 text-ink/40" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
