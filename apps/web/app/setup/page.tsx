"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function Setup() {
  const [status, setStatus] = useState<any>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", company: "" });
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
      const res = await api("/setup/init", { method: "POST", body: JSON.stringify(form) });
      localStorage.setItem("lh_token", res.token);
      localStorage.setItem("lh_business", res.businessId);
      window.location.href = "/command";
    } catch (e: any) { setError(e.message); setBusy(false); }
  }

  if (!status) return <main className="flex min-h-screen items-center justify-center"><p className="text-sm text-ink/50">Checking your installation…</p></main>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-4">
      <div className="card w-full max-w-lg">
        <h1 className="text-2xl font-semibold">Set up Kingslee AIOS</h1>
        <p className="mb-5 mt-1 text-sm text-ink/60">One step. This creates your admin account, your company workspace, and activates all {status.agentCount ?? 28} AI departments.</p>

        {/* Connection check */}
        <div className="mb-5 flex items-center gap-2 rounded-lg bg-paper p-3 text-sm">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${status.database ? "bg-signal" : "bg-danger"}`} />
          {status.database ? "Database connected ✓" : "Database not reachable — check DATABASE_URL and that the app finished starting."}
        </div>

        {status.database && (
          <>
            <label className="mb-1 block text-xs font-medium text-ink/60">Your name</label>
            <input className="input mb-3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label className="mb-1 block text-xs font-medium text-ink/60">Company / workspace name</label>
            <input className="input mb-3" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Kingslee Inc." />
            <label className="mb-1 block text-xs font-medium text-ink/60">Admin email</label>
            <input className="input mb-3" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <label className="mb-1 block text-xs font-medium text-ink/60">Password (min 8 chars)</label>
            <input className="input mb-4" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            {error && <p className="mb-3 text-sm text-danger">{error}</p>}
            <button className="btn w-full justify-center" disabled={busy || !form.email || form.password.length < 8 || !form.company || !form.name} onClick={init}>
              {busy ? "Setting up…" : "Finish setup & sign in"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
