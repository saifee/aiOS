"use client";
import type { LucideIcon } from "lucide-react";
import { usePrefs } from "@/components/Prefs";

export type TabDef<T extends string> = { id: T; label: string; icon: LucideIcon };

export function PageHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  const { t } = usePrefs();
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-3xl font-extrabold">{t(title)}</h1><p className="mt-1 max-w-2xl text-sm text-ink/60">{t(subtitle)}</p></div>
      {children}
    </header>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: TabDef<T>[]; value: T; onChange: (t: T) => void }) {
  const { t: tr } = usePrefs();
  return (
    <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1 shadow-card">
      {tabs.map((t) => {
        const on = t.id === value; const Icon = t.icon;
        return (
          <button key={t.id} role="tab" aria-selected={on} onClick={() => onChange(t.id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${on ? "bg-navy text-white" : "text-ink/60 hover:bg-paper hover:text-ink"}`}>
            <Icon className="h-4 w-4" />{tr(t.label)}
          </button>
        );
      })}
    </div>
  );
}
