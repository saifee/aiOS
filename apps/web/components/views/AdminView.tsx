"use client";
import { useState } from "react";
import useSWR from "swr";
import { ArrowLeft, Search } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { toast } from "@/lib/toast";
import { usePrefs } from "@/components/Prefs";

const PLAN_OPTIONS = ["FREE", "TRIAL", "STARTER", "GROWTH", "SCALE", "ENTERPRISE"];
const STATUS_OPTIONS = ["active", "trialing", "past_due", "canceled"];
const METHODS = [["manual", "Manual"], ["bank_transfer", "Bank transfer"], ["cash", "Cash"], ["stripe", "Stripe"], ["other", "Other"]];
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "—");
const money = (cents: number, cur: string) => `${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${cur}`;

/** Platform superadmin: every user, their workspace subscription, plan allocation and manual payments. */
export function AdminView() {
  const { t } = usePrefs();
  const [q, setQ] = useState(""); const [term, setTerm] = useState(""); const [tenant, setTenant] = useState<string | null>(null);
  const { data, error } = useSWR(`/admin/users?q=${encodeURIComponent(term)}`, fetcher);
  if (tenant) return <TenantPanel id={tenant} onBack={() => setTenant(null)} />;
  return (
    <div className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }}>
        <div className="relative flex-1"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <input className="input ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search by name or email")} aria-label={t("Search by name or email")} /></div>
        <button className="btn">{t("Search")}</button>
      </form>
      {error && <div className="card text-sm text-danger">{String(error.message)}</div>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-start text-sm">
          <thead className="border-b border-line text-xs uppercase text-ink/50"><tr>
            <th className="p-3 text-start">{t("Name")}</th><th className="p-3 text-start">{t("Workspaces")}</th><th className="p-3 text-start">{t("Plan")}</th><th className="p-3 text-start">{t("Status")}</th><th className="p-3 text-start">{t("Paid until")}</th><th className="p-3" /></tr></thead>
          <tbody>
            {data?.users?.flatMap((u: any) => (u.workspaces.length ? u.workspaces : [null]).map((w: any, i: number) => (
              <tr key={u.id + i} className="border-b border-line last:border-0">
                <td className="p-3">{i === 0 && <><div className="font-semibold">{u.name || u.email}</div><div className="text-xs text-ink/55">{u.email}</div></>}</td>
                <td className="p-3">{w ? <>{w.name} <span className="tag">{w.role}</span></> : "—"}</td>
                <td className="p-3">{w && <span className="tag">{w.plan}</span>}</td>
                <td className="p-3 text-ink/70">{w?.status}</td>
                <td className="p-3 text-ink/70">{fmt(w?.currentPeriodEnd)}</td>
                <td className="p-3 text-end">{w && <button className="btn-ghost px-3 py-1.5" onClick={() => setTenant(w.id)}>{t("Manage")}</button>}</td>
              </tr>)))}
          </tbody>
        </table>
        {data && !data.users.length && <p className="p-4 text-sm text-ink/60">{t("No users found.")}</p>}
        {!data && !error && <p className="p-4 text-sm text-ink/60">{t("Loading…")}</p>}
      </div>
    </div>
  );
}

function TenantPanel({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = usePrefs();
  const { data, mutate } = useSWR(`/admin/tenants/${id}`, fetcher);
  const [plan, setPlan] = useState(""); const [status, setStatus] = useState(""); const [end, setEnd] = useState("");
  const [pay, setPay] = useState({ amount: "", currency: "USD", method: "bank_transfer", reference: "", note: "", activatePlan: "", months: "1" });
  if (!data) return <p className="text-sm text-ink/60">{t("Loading…")}</p>;
  const sub = data.subscription;
  const curPlan = plan || sub?.plan || data.plan, curStatus = status || sub?.status || "active";

  async function saveSub() {
    try {
      await api(`/admin/tenants/${id}/subscription`, { method: "PUT", body: JSON.stringify({ plan: curPlan, status: curStatus, ...(end && { currentPeriodEnd: new Date(end + "T23:59:59Z").toISOString() }) }) });
      toast(t("Saved.")); mutate();
    } catch (e: any) { toast(e.message); }
  }
  async function record(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/admin/tenants/${id}/payments`, { method: "POST", body: JSON.stringify({ amount: Number(pay.amount), currency: pay.currency, method: pay.method, reference: pay.reference || undefined, note: pay.note || undefined, ...(pay.activatePlan && { activatePlan: pay.activatePlan, months: Number(pay.months) || 1 }) }) });
      toast(t("Saved.")); setPay({ ...pay, amount: "", reference: "", note: "" }); mutate();
    } catch (err: any) { toast(err.message); }
  }
  const f = (k: keyof typeof pay) => ({ value: pay[k], onChange: (e: any) => setPay({ ...pay, [k]: e.target.value }) });

  return (
    <div className="space-y-5">
      <button className="btn-ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t("Back")}</button>
      <div><h2 className="text-xl font-bold">{data.name}</h2><p className="text-sm text-ink/60">{data.members.map((m: any) => `${m.name || m.email} (${m.role})`).join(", ")}</p></div>

      <div className="card space-y-3">
        <h3 className="font-bold">{t("Subscription")}</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-sm">{t("Plan")}<select className="input mt-1" value={curPlan} onChange={(e) => setPlan(e.target.value)}>{PLAN_OPTIONS.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="text-sm">{t("Status")}<select className="input mt-1" value={curStatus} onChange={(e) => setStatus(e.target.value)}>{STATUS_OPTIONS.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="text-sm">{t("Paid until")}<input type="date" className="input mt-1" value={end} onChange={(e) => setEnd(e.target.value)} placeholder={sub?.currentPeriodEnd ? fmt(sub.currentPeriodEnd) : ""} /></label>
          <div className="flex items-end"><button className="btn w-full" onClick={saveSub}>{t("Save subscription")}</button></div>
        </div>
        <p className="text-xs text-ink/55">{sub ? `${sub.plan} · ${sub.status} · ${fmt(sub.currentPeriodEnd)}${sub.viaStripe ? " · Stripe" : ""}` : "No subscription record yet."}</p>
      </div>

      <form className="card space-y-3" onSubmit={record}>
        <h3 className="font-bold">{t("Record a manual payment")}</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-sm">{t("Amount")}<input required type="number" min="0.01" step="0.01" className="input mt-1" {...f("amount")} /></label>
          <label className="text-sm">{t("Currency")}<input required maxLength={3} className="input mt-1 uppercase" {...f("currency")} /></label>
          <label className="text-sm">{t("Method")}<select className="input mt-1" {...f("method")}>{METHODS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></label>
          <label className="text-sm">{t("Reference")}<input maxLength={190} className="input mt-1" {...f("reference")} /></label>
          <label className="text-sm sm:col-span-2">{t("Note")}<input maxLength={190} className="input mt-1" {...f("note")} /></label>
          <label className="text-sm">{t("Activate plan")}<select className="input mt-1" {...f("activatePlan")}><option value="">—</option>{PLAN_OPTIONS.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="text-sm">{t("Months")}<input type="number" min="1" max="60" className="input mt-1" {...f("months")} disabled={!pay.activatePlan} /></label>
        </div>
        <button className="btn">{t("Record payment")}</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <h3 className="p-4 pb-2 font-bold">{t("Payments")}</h3>
        {data.payments.length ? (
          <table className="w-full text-sm"><tbody>{data.payments.map((p: any) => (
            <tr key={p.id} className="border-t border-line"><td className="p-3">{fmt(p.createdAt)}</td><td className="p-3 font-semibold">{money(p.amountCents, p.currency)}</td><td className="p-3"><span className="tag">{p.method}</span></td><td className="p-3 text-ink/70">{p.plan ? `${p.plan} × ${p.months ?? 1}` : ""}</td><td className="p-3 text-ink/70">{p.reference}</td><td className="p-3 text-ink/70">{p.note}</td></tr>))}</tbody></table>
        ) : <p className="p-4 pt-0 text-sm text-ink/60">{t("No payments yet.")}</p>}
      </div>
    </div>
  );
}
