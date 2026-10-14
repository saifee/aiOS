"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api, setToken } from "@/lib/api";
import { LogoMark, Wordmark } from "@/components/Logo";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ email: "", password: "", name: "", tenantName: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("mode") === "register") setMode("register"); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const res = await api(`/auth/${mode}`, { method: "POST", body: JSON.stringify(form) });
      setToken(res.token);
      window.location.href = mode === "register" ? "/settings#business" : "/dashboard";
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  }
  const f = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-gradient-to-br from-ink via-[#14296B] to-[#4B3AA8] p-12 text-white lg:flex">
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
          {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
          <button className="btn w-full py-2.5" disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Sign in" : "Create workspace"}</button>
          <button type="button" className="mt-4 w-full text-center text-sm font-semibold text-signal" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
            {mode === "login" ? "New here? Create a free workspace" : "Already have an account? Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
