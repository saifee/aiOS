"use client";
import useSWR from "swr";
import { fetcher, api, businessId } from "@/lib/api";

export default function Billing() {
  const { data: sub, mutate } = useSWR("/billing/subscription", fetcher);
  const { data: plans } = useSWR("/billing/plans", fetcher);

  async function upgrade(plan: string) {
    try { const res = await api("/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) }); if (res.url) window.location.href = res.url; }
    catch (e: any) { alert(e.message); }
  }
  async function portal() {
    try { const res = await api("/billing/portal", { method: "POST" }); if (res.url) window.location.href = res.url; }
    catch (e: any) { alert(e.message); }
  }

  const pct = (used: number, limit: number) => Math.min(100, Math.round((used / limit) * 100));
  const meters = sub ? [
    ["Leads", sub.usage.leads ?? 0, sub.limits.leads],
    ["Outreach", sub.usage.outreach ?? 0, sub.limits.outreach],
    ["Calls", sub.usage.calls ?? 0, sub.limits.calls],
  ] : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-ink/60">Plan, usage, and invoices.</p>
        </div>
        <button className="btn-ghost" onClick={portal}>Manage payment</button>
      </header>

      {sub && (
        <div className="card">
          <div className="flex items-center justify-between">
            <div><span className="tag">{sub.plan}</span> <span className="ml-2 text-sm text-ink/60">{sub.status}</span></div>
            {sub.currentPeriodEnd && <span className="text-xs text-ink/40">renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}</span>}
          </div>
          <div className="mt-4 space-y-3">
            {meters.map(([label, used, limit]: any) => (
              <div key={label}>
                <div className="flex justify-between text-xs text-ink/60"><span>{label}</span><span>{used} / {limit >= 1e9 ? "∞" : limit}</span></div>
                <div className="mt-1 h-2 rounded-full bg-line"><div className="h-2 rounded-full bg-signal" style={{ width: pct(used, limit) + "%" }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {(plans ?? []).filter((p: any) => ["STARTER", "GROWTH", "SCALE"].includes(p.key)).map((p: any) => (
          <div key={p.key} className={`card ${sub?.plan === p.key ? "border-signal ring-1 ring-signal" : ""}`}>
            <h2 className="font-display text-lg font-semibold">{p.name}</h2>
            <div className="mt-1 font-display text-3xl font-semibold">${p.priceMonthly}<span className="text-sm font-normal text-ink/50">/mo</span></div>
            <ul className="mt-4 space-y-1 text-sm text-ink/70">
              <li>{p.limits.leads.toLocaleString()} leads/mo</li>
              <li>{p.limits.outreach.toLocaleString()} outreach/mo</li>
              <li>{p.limits.calls.toLocaleString()} AI calls/mo</li>
              <li>{p.limits.seats} seats · {p.limits.agents} agents</li>
            </ul>
            <button className="btn mt-5 w-full justify-center" disabled={sub?.plan === p.key} onClick={() => upgrade(p.key)}>
              {sub?.plan === p.key ? "Current plan" : "Upgrade"}
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink/40">Enterprise? <button className="text-signal" onClick={portal}>Talk to us</button> for custom limits and SLAs.</p>
    </div>
  );
}
