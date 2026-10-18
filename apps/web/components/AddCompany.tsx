"use client";
import { useState } from "react";
import { Building2, User, X } from "lucide-react";
import { api, setBusinessId } from "@/lib/api";
import { toast } from "@/lib/toast";
import { usePrefs } from "@/components/Prefs";

/** Create another company, or a Personal assistant space (no company needed), inside the same account. */
export function AddCompany({ onClose }: { onClose: () => void }) {
  const { t } = usePrefs();
  const [kind, setKind] = useState<"company" | "personal">("company");
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const biz = await api("/businesses", { method: "POST", body: JSON.stringify({
        name: name.trim() || (kind === "personal" ? "My personal assistant" : "New company"), kind, languages: ["en", "ar"],
        ...(kind === "personal" && { description: "Personal assistant space: planning, reminders, messages, budgeting and life admin." }),
      }) });
      setBusinessId(biz.id); window.location.href = kind === "personal" ? "/dashboard" : "/settings#business";
    } catch (err: any) { toast(err.message, "error"); setBusy(false); }
  }
  const opt = (k: "company" | "personal", Icon: any, title: string, sub: string) => (
    <button type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
      className={`flex flex-1 flex-col items-start gap-1 rounded-xl border p-3 text-start text-sm transition ${kind === k ? "border-signal bg-signalSoft ring-1 ring-signal" : "border-line hover:bg-paper"}`}>
      <Icon className="h-5 w-5 text-signal" /><span className="font-semibold">{t(title)}</span><span className="text-xs text-ink/60">{sub}</span>
    </button>);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/50 p-4" onClick={onClose}>
      <form onSubmit={create} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-2xl bg-surface p-5 shadow-lift" role="dialog" aria-modal="true" aria-label={t("Add company")}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{t("Add company")}</h2><button type="button" aria-label={t("Cancel")} onClick={onClose}><X className="h-5 w-5" /></button></div>
        <div className="flex gap-2">
          {opt("company", Building2, "Company", "Leads, campaigns, receptionist and a full AI team.")}
          {opt("personal", User, "Personal space", "Just you: plans, replies, budget, trips. No company needed.")}
        </div>
        <label className="block text-sm font-medium">{t("Name")}
          <input className="input mt-1" value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} placeholder={kind === "personal" ? "My personal assistant" : "Acme Trading"} /></label>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>{t("Cancel")}</button><button className="btn" disabled={busy}>{t("Create")}</button></div>
      </form>
    </div>
  );
}
