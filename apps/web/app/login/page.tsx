"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api, setToken } from "@/lib/api";
import { LogoMark, Wordmark } from "@/components/Logo";
import { Captcha } from "@/components/Captcha";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ email: "", password: "", name: "", tenantName: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState(""); const [capKey, setCapKey] = useState(0);
  const [sso, setSso] = useState<{ google?: boolean; microsoft?: boolean }>({});
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("mode") === "register") setMode("register");
    if (q.get("sso_error")) setError(q.get("sso_error")!);
    const m = /sso=([\w.-]+)/.exec(window.location.hash);   // token arrives in the URL fragment, so it never reaches server logs
    if (m) { setToken(m[1]); window.history.replaceState(null, "", "/login"); window.location.href = "/dashboard"; return; }
    api("/auth/oauth/providers").then(setSso).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const res = await api(`/auth/${mode}`, { method: "POST", body: JSON.stringify({ ...form, ...(captcha && { captcha }) }) });
      setToken(res.token);
      window.location.href = mode === "register" ? "/settings#business" : "/dashboard";
    } catch (e: any) { setError(e.message); setCapKey((k) => k + 1); }
    setBusy(false);
  }
  const f = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-gradient-to-br from-navy via-[#14296B] to-[#4B3AA8] p-12 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2"><LogoMark /><Wordmark light /></Link>
        <div>
          <h1 className="max-w-md text-4xl font-extrabold leading-tight">A full team, ready when you are.</h1>
          <ul className="mt-6 space-y-3 text-white/80">{["27 AI specialists on one shared memory", "Bring your own AI keys, free options included", "Nothing sensitive happens without your approval"].map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 h-5 w-5 shrink-0 text-[#9DB0FF]" />{t}</li>)}</ul>
        </div>
        <p className="text-sm text-white/50">Hire. Delegate. Grow.</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden"><LogoMark /><Wordmark /></Link>
          <h2 className="text-3xl font-extrabold">{mode === "login" ? "Welcome back" : "Create your free workspace"}</h2>
          <p className="mb-6 mt-1 text-sm text-ink/60">{mode === "login" ? "Sign in to your aiOS workspace." : "No card needed. You can add your own AI key right after."}</p>
          {mode === "register" && (<>
            <label className="mb-3 block text-sm font-medium">Your name<input className="input mt-1" autoComplete="name" required {...f("name")} /></label>
            <label className="mb-3 block text-sm font-medium">Company name<input className="input mt-1" autoComplete="organization" required {...f("tenantName")} /></label>
          </>)}
          <label className="mb-3 block text-sm font-medium">Email<input className="input mt-1" type="email" autoComplete="email" required {...f("email")} /></label>
          <label className="mb-4 block text-sm font-medium">Password<input className="input mt-1" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 10 : undefined} required {...f("password")} />
            {mode === "register" && <span className="text-xs text-ink/50">At least 10 characters.</span>}</label>
          <Captcha onToken={setCaptcha} resetKey={capKey} />
          {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
          <button className="btn w-full py-2.5" disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Sign in" : "Create workspace"}</button>
          {(sso.google || sso.microsoft) && (
            <div className="mt-5">
              <div className="mb-3 flex items-center gap-3 text-xs text-ink/50"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
              <div className="grid gap-2">
                {sso.google && <a className="btn-ghost justify-center border border-line py-2.5" href="/v1/auth/oauth/google/start"><svg className="me-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.4a12 12 0 0 0 0 11z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>Continue with Google</a>}
                {sso.microsoft && <a className="btn-ghost justify-center border border-line py-2.5" href="/v1/auth/oauth/microsoft/start"><svg className="me-2 h-4 w-4" viewBox="0 0 23 23" aria-hidden><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M12 1h10v10H12z"/><path fill="#00A4EF" d="M1 12h10v10H1z"/><path fill="#FFB900" d="M12 12h10v10H12z"/></svg>Continue with Microsoft</a>}
              </div>
            </div>
          )}
          <button type="button" className="mt-4 w-full text-center text-sm font-semibold text-signal" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
            {mode === "login" ? "New here? Create a free workspace" : "Already have an account? Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
