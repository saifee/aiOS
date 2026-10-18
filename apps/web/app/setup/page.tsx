"use client";
import { useEffect, useState } from "react";
import { Captcha } from "@/components/Captcha";
import { api, setToken, setBusinessId } from "@/lib/api";
import { LogoMark, Wordmark } from "@/components/Logo";

export default function Setup() {
  const [status, setStatus] = useState<any>(null);
  const [captcha, setCaptcha] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", company: "", setupToken: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/setup/status")
      .then((s) => { setStatus(s); if (s.configured) window.location.href = "/login"; })
      .catch(() => setStatus({ database: false, configured: false }));
  }, []);

  async function init() {
    setError(""); setBusy(true);
    try {
      const res = await api("/setup/init", { method: "POST", body: JSON.stringify({ ...form, ...(captcha && { captcha }) }) });
      setToken(res.token);
      setBusinessId(res.businessId);
      window.location.href = "/dashboard";
    } catch (e: any) { setError(e.message); setBusy(false); }
  }

  if (!status) return <main className="flex min-h-screen items-center justify-center"><p className="text-sm text-ink/50">Checking your installation…</p></main>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-4">
      <div className="card w-full max-w-lg">
        <div className="mb-4 flex items-center gap-2"><LogoMark /><Wordmark /></div>
        <h1 className="text-2xl font-extrabold">Set up your workspace</h1>
        <p className="mb-5 mt-1 text-sm text-ink/60">One step. This creates your admin account, your company workspace, and activates all {status.agentCount ?? 27} AI specialists. You will be the owner, with unlimited access.</p>

        {/* Connection check */}
        <div className="mb-5 flex items-start gap-2 rounded-lg bg-paper p-3 text-sm">
          <span className={`inline-block mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${status.database ? "bg-signal" : "bg-danger"}`} />
          <div>
            {status.database ? "Database connected ✓" : "Database not reachable — check DATABASE_URL and that the app finished starting."}
            {!status.database && status.error && <div className="mt-2 text-xs opacity-80 break-words">Reason: {status.error}</div>}
          </div>
        </div>

        {status.database && (
          <>
            <label className="mb-1 block text-xs font-medium text-ink/60">Your name</label>
            <input className="input mb-3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label className="mb-1 block text-xs font-medium text-ink/60">Company / workspace name</label>
            <input className="input mb-3" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme Inc." />
            <label className="mb-1 block text-xs font-medium text-ink/60">Admin email</label>
            <input className="input mb-3" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <label className="mb-1 block text-xs font-medium text-ink/60">Password (min 10 chars)</label>
            <input className="input mb-4" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            {status?.setupTokenRequired && (<>
              <label className="mb-1 block text-xs font-medium text-ink/60">Setup token (SETUP_TOKEN from your server settings)</label>
              <input className="input mb-4" type="password" autoComplete="off" value={form.setupToken} onChange={(e) => setForm({ ...form, setupToken: e.target.value })} />
            </>)}
            {error && <p className="mb-3 text-sm text-danger">{error}</p>}
            <Captcha onToken={setCaptcha} />
            <button className="btn w-full justify-center" disabled={busy || !form.email || form.password.length < 10 || !form.company || !form.name} onClick={init}>
              {busy ? "Setting up…" : "Finish setup & sign in"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
