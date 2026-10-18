"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, token, setToken } from "@/lib/api";
import { LogoMark, Wordmark } from "@/components/Logo";
import { Captcha } from "@/components/Captcha";

/** Landing page for the link in an invitation email: /join?t=<token>. */
export default function Join() {
  const [tok, setTok] = useState(""); const [info, setInfo] = useState<any>(null); const [err, setErr] = useState("");
  const [f, setF] = useState({ name: "", password: "" }); const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState(""); const [capKey, setCapKey] = useState(0);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") ?? ""; setTok(t);
    if (!t) { setErr("This invitation link is incomplete."); return; }
    api(`/public/invite/${t}`).then(setInfo).catch((e) => setErr(e.message));
  }, []);

  async function accept(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const r = await api("/auth/invite/accept", { method: "POST", body: JSON.stringify({ token: tok, ...(!info.accountExists && f), ...(captcha && { captcha }) }) });
      setToken(r.token); window.location.href = "/dashboard";
    } catch (x: any) { setErr(x.message); setCapKey((k) => k + 1); }
    setBusy(false);
  }
  const signedIn = typeof window !== "undefined" && !!token();

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center gap-2"><LogoMark /><Wordmark /></Link>
        {!info && !err && <p className="text-sm text-ink/60">Checking your invitation…</p>}
        {err && !info && <><h1 className="text-2xl font-extrabold">Invitation not available</h1><p role="alert" className="mt-2 text-sm text-danger">{err}</p><p className="mt-4 text-sm text-ink/60">Ask the person who invited you to send a new one.</p></>}
        {info && (
          <form onSubmit={accept}>
            <h1 className="text-3xl font-extrabold">Join {info.workspace}</h1>
            <p className="mb-6 mt-1 text-sm text-ink/60">You were invited as <b>{info.email}</b>.</p>
            {info.accountExists ? (
              signedIn
                ? <p className="mb-4 text-sm text-ink/70">You already have an aiOS account. Continue to add this workspace to it.</p>
                : <p className="mb-4 text-sm text-ink/70">This email already has an aiOS account. <Link className="font-semibold text-brand underline" href="/login">Sign in</Link> with it, then open this invitation link again.</p>
            ) : (<>
              <label className="mb-3 block text-sm font-medium">Your name<input className="input mt-1" autoComplete="name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
              <label className="mb-4 block text-sm font-medium">Choose a password<input className="input mt-1" type="password" autoComplete="new-password" minLength={10} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /><span className="text-xs text-ink/50">At least 10 characters.</span></label>
              <Captcha onToken={setCaptcha} resetKey={capKey} />
            </>)}
            {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
            {(!info.accountExists || signedIn) && <button className="btn w-full py-2.5" disabled={busy}>{busy ? "One moment…" : "Join"}</button>}
          </form>
        )}
      </div>
    </main>
  );
}
