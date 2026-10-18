"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type Cfg = { provider: "turnstile" | "recaptcha" | null; siteKey?: string };
declare global { interface Window { turnstile?: any; grecaptcha?: any } }

const SRC = { turnstile: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", recaptcha: "https://www.google.com/recaptcha/api.js?render=explicit" };
const loaded: Record<string, Promise<void>> = {};
const load = (p: "turnstile" | "recaptcha") => (loaded[p] ??= new Promise<void>((res, rej) => {
  const s = document.createElement("script"); s.src = SRC[p]; s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error("captcha script blocked"));
  document.head.appendChild(s);
}));

/** Shows Cloudflare Turnstile or Google reCAPTCHA when the server has one configured; renders nothing otherwise.
 *  `onToken` receives the one-time token (or "" when it expires). Change `resetKey` after each submit: tokens are single-use. */
export function Captcha({ onToken, resetKey = 0 }: { onToken: (t: string) => void; resetKey?: number }) {
  const [cfg, setCfg] = useState<Cfg | null>(null); const [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null); const wid = useRef<any>(null);
  useEffect(() => { api("/auth/captcha").then(setCfg).catch(() => setCfg({ provider: null })); }, []);
  useEffect(() => {
    if (!cfg?.provider || !cfg.siteKey || !box.current) return;
    let dead = false; const p = cfg.provider;
    load(p).then(() => {
      if (dead || !box.current) return;
      const api_ = p === "turnstile" ? window.turnstile : window.grecaptcha;
      const go = () => { wid.current = api_.render(box.current, { sitekey: cfg.siteKey, callback: (t: string) => onToken(t), "expired-callback": () => onToken(""), "error-callback": () => onToken("") }); };
      p === "recaptcha" && api_.ready ? api_.ready(go) : go();
    }).catch((e) => setErr(e.message));
    return () => { dead = true; };
  }, [cfg]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!cfg?.provider || wid.current == null) return;
    try { (cfg.provider === "turnstile" ? window.turnstile : window.grecaptcha)?.reset(wid.current); } catch { /* ignore */ }
    onToken("");
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cfg?.provider) return null;
  return <div className="my-3">{err ? <p role="alert" className="text-sm text-danger">The security check could not load. Disable ad blockers for this site and refresh.</p> : <div ref={box} />}</div>;
}
