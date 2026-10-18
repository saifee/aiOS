"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { CheckCircle2, Copy, MessageCircle, RefreshCw } from "lucide-react";
import { api, businessId, fetcher } from "@/lib/api";
import { toast } from "@/lib/toast";
import { usePrefs } from "@/components/Prefs";

const newToken = () => { const a = new Uint8Array(18); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join(""); };

/** Connect channels per company. Secrets are encrypted on the server and are never shown again. */
export function IntegrationsView() {
  const { t } = usePrefs();
  const [bid, setBid] = useState<string | null>(null);
  useEffect(() => setBid(businessId()), []);
  const { data, mutate } = useSWR(bid ? `/businesses/${bid}/integrations` : null, fetcher);
  const wa = data?.connected?.find((c: any) => c.provider === "whatsapp_cloud");
  const [f, setF] = useState({ phoneNumberId: "", wabaId: "", accessToken: "", appSecret: "", verifyToken: "" });
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState<string>("");
  useEffect(() => { if (wa?.config) setF((x) => ({ ...x, phoneNumberId: wa.config.phoneNumberId ?? "", wabaId: wa.config.wabaId ?? "" })); }, [wa?.config?.phoneNumberId]);
  useEffect(() => { setF((x) => (x.verifyToken ? x : { ...x, verifyToken: newToken() })); }, []);

  const webhook = typeof window !== "undefined" ? `${window.location.origin}/v1/webhooks/whatsapp` : "";
  const copy = (v: string) => { navigator.clipboard?.writeText(v); toast("Copied"); };

  async function save() {
    if (!bid) return;
    setBusy(true);
    try {
      const credentials: Record<string, string> = { verifyToken: f.verifyToken };
      if (f.accessToken) credentials.accessToken = f.accessToken; if (f.appSecret) credentials.appSecret = f.appSecret;
      // A saved connection keeps its stored token/secret when those fields are left blank.
      await api(`/businesses/${bid}/integrations/whatsapp_cloud`, { method: "PUT", body: JSON.stringify({ credentials: wa && !f.accessToken && !f.appSecret ? undefined : credentials, config: { phoneNumberId: f.phoneNumberId.trim(), wabaId: f.wabaId.trim() || undefined } }) });
      toast(t("Saved.")); setF((x) => ({ ...x, accessToken: "", appSecret: "" })); mutate();
    } catch (e: any) { toast(e.message, "error"); }
    setBusy(false);
  }
  async function test() {
    setStatus("…");
    try { const r = await api(`/businesses/${bid}/integrations/whatsapp_cloud/test`, { method: "POST" }); setStatus(`✓ ${r.name ?? ""} ${r.number ?? ""}`); }
    catch (e: any) { setStatus(""); toast(e.message, "error"); }
  }
  if (!bid) return <p className="text-sm text-ink/60">Create or select a company first (Settings → Business).</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold"><MessageCircle className="h-5 w-5 text-ok" />WhatsApp Business (Cloud API)</h3>
          {wa?.status === "connected" && <span className="tag"><CheckCircle2 className="me-1 inline h-3 w-3" />Connected</span>}
        </div>
        <ol className="list-decimal space-y-1 ps-5 text-sm text-ink/70">
          <li>In Meta for Developers, open your app → WhatsApp → API setup. Copy the <b>Phone number ID</b> and create a permanent <b>access token</b> (System User).</li>
          <li>Under WhatsApp → Configuration, set the callback URL and verify token shown below, then subscribe to <b>messages</b>.</li>
          <li>Paste the details here, save, and press Test.</li>
        </ol>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Phone number ID<input className="input mt-1" inputMode="numeric" value={f.phoneNumberId} onChange={(e) => setF({ ...f, phoneNumberId: e.target.value })} placeholder="1234567890123456" /></label>
          <label className="text-sm font-medium">WhatsApp Business Account ID (optional)<input className="input mt-1" inputMode="numeric" value={f.wabaId} onChange={(e) => setF({ ...f, wabaId: e.target.value })} /></label>
          <label className="text-sm font-medium">Access token<input type="password" autoComplete="off" className="input mt-1" value={f.accessToken} onChange={(e) => setF({ ...f, accessToken: e.target.value })} placeholder={wa ? "Saved. Leave blank to keep it" : "EAAG…"} /></label>
          <label className="text-sm font-medium">App secret (verifies incoming messages)<input type="password" autoComplete="off" className="input mt-1" value={f.appSecret} onChange={(e) => setF({ ...f, appSecret: e.target.value })} placeholder={wa ? "Saved. Leave blank to keep it" : "From Meta app settings → Basic"} /></label>
        </div>
        <div className="space-y-2 rounded-xl bg-paper p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate"><b>Callback URL:</b> <code>{webhook}</code></span><button className="btn-ghost px-2 py-1" aria-label="Copy callback URL" onClick={() => copy(webhook)}><Copy className="h-4 w-4" /></button></div>
          <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate"><b>Verify token:</b> <code>{f.verifyToken}</code></span>
            <span className="flex gap-1"><button className="btn-ghost px-2 py-1" aria-label="Copy verify token" onClick={() => copy(f.verifyToken)}><Copy className="h-4 w-4" /></button><button className="btn-ghost px-2 py-1" aria-label="New verify token" onClick={() => setF({ ...f, verifyToken: newToken() })}><RefreshCw className="h-4 w-4" /></button></span></div>
          <p className="text-xs text-ink/55">Save before pressing Verify in Meta, and save again if you generate a new token.</p>
        </div>
        <div className="flex items-center gap-2"><button className="btn" onClick={save} disabled={busy || !f.phoneNumberId.trim() || (!wa && !f.accessToken)}>{t("Save")}</button>
          <button className="btn-ghost" onClick={test} disabled={!wa}>Test connection</button><span className="text-sm text-ok">{status}</span></div>
        <p className="text-xs text-ink/55">Business-initiated chats need an approved template named <code>intro_outreach</code>; replies inside 24 hours are free-form.</p>
      </div>
    </div>
  );
}
