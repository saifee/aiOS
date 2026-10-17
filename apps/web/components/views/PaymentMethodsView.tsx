"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Plus, Trash2 } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { toast } from "@/lib/toast";
import { usePrefs } from "@/components/Prefs";

const TYPES = [["bank_transfer", "Bank transfer"], ["cash", "Cash"], ["paypal", "PayPal"], ["wallet", "Wallet"], ["other", "Other"]];
type Manual = { id?: string; type: string; label: string; instructions: string; enabled: boolean };

/** Superadmin: configure how customers can pay — Stripe and/or manual methods. Secrets are write-only. */
export function PaymentMethodsView() {
  const { t } = usePrefs();
  const { data, mutate } = useSWR("/admin/payment-methods", fetcher);
  const [stripe, setStripe] = useState({ enabled: false, publishableKey: "", secretKey: "", webhookSecret: "", STARTER: "", GROWTH: "", SCALE: "" });
  const [manual, setManual] = useState<Manual[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setStripe((s) => ({ ...s, enabled: data.stripe.enabled, publishableKey: data.stripe.publishableKey, STARTER: data.stripe.prices?.STARTER ?? "", GROWTH: data.stripe.prices?.GROWTH ?? "", SCALE: data.stripe.prices?.SCALE ?? "", secretKey: "", webhookSecret: "" }));
    setManual(data.manual);
  }, [data]);

  async function save() {
    setBusy(true);
    try {
      await api("/admin/payment-methods", { method: "PUT", body: JSON.stringify({
        stripe: { enabled: stripe.enabled, publishableKey: stripe.publishableKey, ...(stripe.secretKey && { secretKey: stripe.secretKey }), ...(stripe.webhookSecret && { webhookSecret: stripe.webhookSecret }), prices: { STARTER: stripe.STARTER, GROWTH: stripe.GROWTH, SCALE: stripe.SCALE } },
        manual: manual.filter((m) => m.label.trim()),
      }) });
      toast(t("Saved.")); mutate();
    } catch (e: any) { toast(e.message); }
    setBusy(false);
  }
  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/v1/webhooks/stripe` : "";
  const upd = (i: number, patch: Partial<Manual>) => setManual(manual.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="card space-y-4">
        <div className="flex items-center justify-between"><h3 className="text-lg font-bold">{t("Stripe")}</h3>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={stripe.enabled} onChange={(e) => setStripe({ ...stripe, enabled: e.target.checked })} />{t("Enabled")}</label></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">{t("Secret key")} {data?.stripe.secretSet && <span className="tag">{data.stripe.secretHint}</span>}
            <input type="password" autoComplete="off" className="input mt-1" placeholder={data?.stripe.secretSet ? t("Leave blank to keep the saved value") : "sk_live_…"} value={stripe.secretKey} onChange={(e) => setStripe({ ...stripe, secretKey: e.target.value })} /></label>
          <label className="text-sm">{t("Webhook secret")} {data?.stripe.webhookSet && <span className="tag">{data.stripe.webhookHint}</span>}
            <input type="password" autoComplete="off" className="input mt-1" placeholder={data?.stripe.webhookSet ? t("Leave blank to keep the saved value") : "whsec_…"} value={stripe.webhookSecret} onChange={(e) => setStripe({ ...stripe, webhookSecret: e.target.value })} /></label>
          <label className="text-sm sm:col-span-2">{t("Publishable key")}<input className="input mt-1" placeholder="pk_live_…" value={stripe.publishableKey} onChange={(e) => setStripe({ ...stripe, publishableKey: e.target.value })} /></label>
        </div>
        <div><div className="mb-1 text-sm font-medium">{t("Price IDs")}</div>
          <div className="grid gap-3 sm:grid-cols-3">{(["STARTER", "GROWTH", "SCALE"] as const).map((p) => (
            <input key={p} className="input" aria-label={`${p} price ID`} placeholder={`${p}: price_…`} value={stripe[p]} onChange={(e) => setStripe({ ...stripe, [p]: e.target.value })} />))}</div></div>
        <p className="text-xs text-ink/55">Webhook endpoint to add in Stripe: <code className="rounded bg-paper px-1">{webhookUrl}</code> (events: checkout.session.completed, customer.subscription.*). Secrets are encrypted and never shown again.</p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between"><h3 className="text-lg font-bold">{t("Other payment methods")}</h3>
          <button className="btn-ghost" onClick={() => setManual([...manual, { type: "bank_transfer", label: "", instructions: "", enabled: true }])}><Plus className="h-4 w-4" />{t("Add")}</button></div>
        {manual.map((m, i) => (
          <div key={m.id ?? i} className="space-y-2 rounded-xl border border-line p-3">
            <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto_auto]">
              <select className="input" aria-label={t("Method")} value={m.type} onChange={(e) => upd(i, { type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>
              <input className="input" aria-label={t("Label")} placeholder={t("Label")} maxLength={60} value={m.label} onChange={(e) => upd(i, { label: e.target.value })} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={m.enabled} onChange={(e) => upd(i, { enabled: e.target.checked })} />{t("Enabled")}</label>
              <button className="btn-ghost px-3" aria-label={t("Remove")} onClick={() => setManual(manual.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
            </div>
            <textarea className="input h-20" maxLength={1000} placeholder={t("Instructions shown to customers")} value={m.instructions} onChange={(e) => upd(i, { instructions: e.target.value })} />
          </div>))}
      </div>
      <button className="btn" onClick={save} disabled={busy}>{t("Save")}</button>
    </div>
  );
}
