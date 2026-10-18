"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { toast } from "@/lib/toast";
import { usePrefs } from "@/components/Prefs";

type P = { id: string; name: string; kind: "smtp" | "api"; help: string; userLabel?: string; secretLabel: string; secret2Label?: string; extra?: "mailgun" | "host" };
const PROVIDERS: P[] = [
  { id: "smtp", name: "Custom SMTP", kind: "smtp", extra: "host", userLabel: "Username", secretLabel: "Password", help: "Any mail server: your hosting provider, Zoho, Mailofly, Mailtrap and similar. Use the host, port and login from their dashboard." },
  { id: "gmail", name: "Gmail / Google Workspace", kind: "smtp", userLabel: "Your Gmail address", secretLabel: "App password", help: "Turn on 2-step verification in your Google account, then create an App password (Google Account → Security → App passwords). Paste the 16-letter password here, not your normal password." },
  { id: "outlook", name: "Outlook / Office 365", kind: "smtp", userLabel: "Your Microsoft 365 email", secretLabel: "Password or app password", help: "Uses smtp.office365.com. Your Microsoft 365 admin must allow 'Authenticated SMTP' for this mailbox; use an app password if you have multi-factor sign-in." },
  { id: "resend", name: "Resend", kind: "api", secretLabel: "API key", help: "Create an API key at resend.com and verify your sending domain first." },
  { id: "mailgun", name: "Mailgun", kind: "api", extra: "mailgun", secretLabel: "Private API key", help: "Use the private API key and the sending domain you verified in Mailgun." },
  { id: "mailjet", name: "Mailjet", kind: "api", secretLabel: "API key", secret2Label: "Secret key", help: "Mailjet gives you an API key and a secret key. Verify your sender address in Mailjet first." },
  { id: "sendgrid", name: "SendGrid", kind: "api", secretLabel: "API key", help: "Create an API key with 'Mail Send' permission and verify your sender." },
  { id: "brevo", name: "Brevo (Sendinblue)", kind: "api", secretLabel: "API key (v3)", help: "Generous free plan. Create an API key under SMTP & API, and verify your sender." },
  { id: "postmark", name: "Postmark", kind: "api", secretLabel: "Server token", help: "Use a server token and a verified sender signature." },
  { id: "maileroo", name: "Maileroo", kind: "smtp", userLabel: "SMTP username", secretLabel: "SMTP password", help: "Uses smtp.maileroo.com on port 587. Copy the SMTP username and password from your Maileroo sending domain." },
];

/** Superadmin: choose how aiOS sends system email (invitations, briefings, alerts). Credentials are encrypted and never shown again. */
export function EmailView() {
  const { t } = usePrefs();
  const { data, mutate } = useSWR("/admin/email", fetcher);
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false); const [to, setTo] = useState(""); const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => { if (data) setF({ ...data, secret: "", secret2: "" }); }, [data]);
  if (!f) return <p className="text-sm text-ink/60">{t("Loading…")}</p>;
  const p = PROVIDERS.find((x) => x.id === f.provider) ?? PROVIDERS[0];
  const set = (patch: any) => setF({ ...f, ...patch });
  const sameSaved = data?.provider === f.provider;

  async function save() {
    setBusy(true); setTest(null);
    try {
      await api("/admin/email", { method: "PUT", body: JSON.stringify({
        enabled: f.enabled, provider: f.provider, fromEmail: f.fromEmail, fromName: f.fromName, replyTo: f.replyTo,
        ...(p.userLabel && { user: f.user }), ...(p.extra === "host" && { host: f.host, port: Number(f.port) || 587, secure: !!f.secure }),
        ...(p.extra === "mailgun" && { domain: f.domain, region: f.region }),
        ...(f.secret && { secret: f.secret }), ...(f.secret2 && { secret2: f.secret2 }),
      }) });
      toast(t("Saved.")); mutate();
    } catch (e: any) { toast(e.message); }
    setBusy(false);
  }
  async function sendTest() {
    setBusy(true); setTest(null);
    try { const r = await api("/admin/email/test", { method: "POST", body: JSON.stringify({ to }) }); setTest({ ok: true, msg: `Sent through ${r.provider}. Check the inbox (and spam folder) of ${to}.` }); }
    catch (e: any) { setTest({ ok: false, msg: e.message }); }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="card space-y-4">
        <div className="flex items-center justify-between"><h3 className="text-lg font-bold">{t("System email")}</h3>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} />{t("Enabled")}</label></div>
        <p className="text-sm text-ink/65">{t("Invitations, daily briefings, booking confirmations and alerts are sent through this connection.")}
          {!f.configured && f.envFallback && <> {t("Right now the server's")} <b>{String(f.envFallback).toUpperCase()}</b> {t("settings are used. Saving a provider here replaces them.")}</>}</p>

        <label className="block text-sm font-medium">{t("Provider")}
          <select className="input mt-1" value={f.provider} onChange={(e) => set({ provider: e.target.value, secret: "", secret2: "" })}>
            {PROVIDERS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <p className="rounded-lg bg-paper p-3 text-xs text-ink/70">{p.help}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">{t("From address")}<input className="input mt-1" type="email" placeholder="noreply@yourdomain.com" value={f.fromEmail} onChange={(e) => set({ fromEmail: e.target.value })} /></label>
          <label className="text-sm">{t("From name")}<input className="input mt-1" placeholder="aiOS" value={f.fromName} onChange={(e) => set({ fromName: e.target.value })} /></label>
          <label className="text-sm sm:col-span-2">{t("Reply-to (optional)")}<input className="input mt-1" type="email" value={f.replyTo} onChange={(e) => set({ replyTo: e.target.value })} /></label>

          {p.extra === "host" && <>
            <label className="text-sm">{t("SMTP host")}<input className="input mt-1" placeholder="smtp.example.com" value={f.host} onChange={(e) => set({ host: e.target.value })} /></label>
            <div className="flex items-end gap-3"><label className="w-28 text-sm">{t("Port")}<input className="input mt-1" type="number" value={f.port} onChange={(e) => set({ port: e.target.value })} /></label>
              <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.secure} onChange={(e) => set({ secure: e.target.checked })} />{t("SSL (port 465)")}</label></div></>}
          {p.extra === "mailgun" && <>
            <label className="text-sm">{t("Sending domain")}<input className="input mt-1" placeholder="mg.yourdomain.com" value={f.domain} onChange={(e) => set({ domain: e.target.value })} /></label>
            <label className="text-sm">{t("Region")}<select className="input mt-1" value={f.region} onChange={(e) => set({ region: e.target.value })}><option value="us">US</option><option value="eu">EU</option></select></label></>}
          {p.userLabel && <label className="text-sm">{t(p.userLabel)}<input className="input mt-1" autoComplete="off" value={f.user} onChange={(e) => set({ user: e.target.value })} /></label>}

          <label className="text-sm">{t(p.secretLabel)} {sameSaved && data?.secretSet && <span className="tag">{data.secretHint}</span>}
            <input type="password" autoComplete="new-password" className="input mt-1" placeholder={sameSaved && data?.secretSet ? t("Leave blank to keep the saved value") : ""} value={f.secret} onChange={(e) => set({ secret: e.target.value })} /></label>
          {p.secret2Label && <label className="text-sm">{t(p.secret2Label)} {sameSaved && data?.secret2Set && <span className="tag">{data.secret2Hint}</span>}
            <input type="password" autoComplete="new-password" className="input mt-1" placeholder={sameSaved && data?.secret2Set ? t("Leave blank to keep the saved value") : ""} value={f.secret2} onChange={(e) => set({ secret2: e.target.value })} /></label>}
        </div>
        <button className="btn" disabled={busy} onClick={save}>{busy ? t("Saving…") : t("Save")}</button>
        <p className="text-xs text-ink/55">{t("Credentials are encrypted on the server and never shown again. Keep the server's ENCRYPTION_KEY unchanged or you will need to enter them again.")}</p>
      </div>

      <div className="card space-y-3">
        <h3 className="text-lg font-bold">{t("Send a test email")}</h3>
        <div className="flex gap-2"><input className="input flex-1" type="email" placeholder="you@example.com" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("Test recipient")} />
          <button className="btn" disabled={busy || !to} onClick={sendTest}>{t("Send test")}</button></div>
        {test && <p role="status" className={`text-sm ${test.ok ? "text-emerald-700" : "text-danger"}`}>{test.msg}</p>}
        <p className="text-xs text-ink/55">{t("Save first, then test. If the test fails, the message shows what the mail provider answered.")}</p>
      </div>
    </div>
  );
}
