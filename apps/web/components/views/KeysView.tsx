"use client";
import useSWR from "swr";
import { useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, ExternalLink, KeyRound, Plus, Trash2, XCircle, Zap } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { toast } from "@/lib/toast";

type Provider = { id: string; label: string; model: string; free: boolean; tools: boolean; keyUrl: string; note: string; custom: boolean };

export function KeysView() {
  const { data: me, mutate: mutateMe } = useMe();
  const { data: providers } = useSWR<Provider[]>("/ai/providers", fetcher);
  const { data, mutate } = useSWR<{ encryptionReady: boolean; keys: any[] }>("/ai/keys", fetcher);
  const [form, setForm] = useState<{ provider: string; key: string; label: string; model: string; baseUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const keys = data?.keys ?? [];
  const prov = (id: string) => providers?.find((p) => p.id === id);

  async function add() {
    if (!form) return;
    setBusy(true);
    try {
      const r = await api("/ai/keys", { method: "POST", body: JSON.stringify({ provider: form.provider, key: form.key, label: form.label || undefined, model: form.model || undefined, baseUrl: form.baseUrl || undefined }) });
      toast(r.test?.ok ? `${prov(form.provider)?.label} key added and working (${r.test.ms} ms).` : `Key saved, but the test failed: ${r.test?.error}`, r.test?.ok ? "info" : "error");
      setForm(null); mutate(); mutateMe();
    } catch (e: any) { toast(e.message, "error"); }
    setBusy(false);
  }
  async function move(i: number, d: number) {
    const ids = keys.map((k) => k.id); const j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api("/ai/keys/reorder", { method: "POST", body: JSON.stringify({ ids }) }); mutate();
  }
  const patch = async (id: string, b: any) => { await api(`/ai/keys/${id}`, { method: "PATCH", body: JSON.stringify(b) }); mutate(); mutateMe(); };
  const test = async (id: string) => { const t = await api(`/ai/keys/${id}/test`, { method: "POST" }); toast(t.ok ? `Working (${t.ms} ms).` : `Failed: ${t.error}`, t.ok ? "info" : "error"); mutate(); };
  const del = async (id: string) => { if (confirm("Remove this key?")) { await api(`/ai/keys/${id}`, { method: "DELETE" }); mutate(); mutateMe(); } };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="card bg-gradient-to-br from-navy to-[#1B2E6B] text-white">
        <div className="flex items-start gap-3">
          <Zap className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
          <div className="text-sm leading-relaxed text-white/85">
            <b className="text-white">Bring your own AI.</b> Add keys from any provider. aiOS tries them in the order below, and if one is rate-limited or out of credit the next one answers automatically.
            Stack a few free tiers (Groq, Gemini, OpenRouter) and your agents keep working at zero cost.
            {me?.byokOnly && <> Your <b className="text-white">Free</b> plan runs entirely on your keys.</>}
          </div>
        </div>
      </div>

      {data && !data.encryptionReady && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm">
          The server has no <code>ENCRYPTION_KEY</code> yet, so keys can't be stored safely. Add a 64-character hex value to your environment variables and restart the app.
        </div>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold">Your failover chain</h3>
        {keys.length === 0 && <div className="card text-sm text-ink/60">No keys yet. Pick a provider below to add your first one.</div>}
        <div className="space-y-2">
          {keys.map((k, i) => {
            const p = prov(k.provider); const ok = !k.lastError && k.lastOkAt;
            return (
              <div key={k.id} className={`card flex flex-wrap items-center gap-3 py-3 ${k.enabled ? "" : "opacity-60"}`}>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-signalSoft text-xs font-bold text-signal" title="Order in the chain">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">{p?.label ?? k.provider}{k.label && <span className="font-normal text-ink/50">· {k.label}</span>}{p?.free && <span className="tag">free tier</span>}</div>
                  <div className="text-xs text-ink/50">••••{k.hint} · {k.model || p?.model || "default model"}</div>
                  {k.lastError ? <div className="mt-1 flex items-start gap-1 text-xs text-danger"><XCircle className="mt-0.5 h-3 w-3 shrink-0" />{k.lastError}</div>
                    : ok ? <div className="mt-1 flex items-center gap-1 text-xs text-ok"><CheckCircle2 className="h-3 w-3" />Working · checked {new Date(k.lastOkAt).toLocaleString()}</div> : null}
                </div>
                <div className="flex items-center gap-1">
                  <button className="btn-ghost px-2" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></button>
                  <button className="btn-ghost px-2" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === keys.length - 1}><ArrowDown className="h-4 w-4" /></button>
                  <button className="btn-ghost" onClick={() => test(k.id)}>Test</button>
                  <label className="flex cursor-pointer items-center gap-1 px-2 text-xs"><input type="checkbox" checked={k.enabled} onChange={(e) => patch(k.id, { enabled: e.target.checked })} />On</label>
                  <button className="btn-ghost px-2 text-danger" aria-label="Remove key" onClick={() => del(k.id)}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Add a provider</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(providers ?? []).map((p) => (
            <button key={p.id} className="card flex flex-col items-start gap-1 text-left transition hover:-translate-y-0.5 hover:shadow-lift" onClick={() => setForm({ provider: p.id, key: "", label: "", model: "", baseUrl: "" })}>
              <div className="flex w-full items-center justify-between"><span className="font-semibold">{p.label}</span><Plus className="h-4 w-4 text-signal" /></div>
              <div className="flex flex-wrap gap-1">{p.free && <span className="tag">free tier</span>}{p.tools && <span className="tag bg-emerald-50 text-ok">agents</span>}</div>
              <p className="text-xs text-ink/55">{p.note || p.model}</p>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink/50">Keys are encrypted before they're stored and are never shown again. Only the last 4 characters are displayed. Keys you mark as shared can be used by teammates and background jobs in your workspace.</p>
      </section>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setForm(null)}>
          <div className="card w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound className="h-5 w-5 text-signal" />Add {prov(form.provider)?.label} key</h2>
            {prov(form.provider)?.keyUrl && <a className="inline-flex items-center gap-1 text-xs text-signal" href={prov(form.provider)!.keyUrl} target="_blank" rel="noreferrer">Get a key from {prov(form.provider)!.label}<ExternalLink className="h-3 w-3" /></a>}
            <input className="input" type="password" autoComplete="off" autoFocus placeholder="Paste your API key" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
            {prov(form.provider)?.custom && <input className="input" placeholder="Base URL, e.g. http://localhost:11434/v1" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />}
            <input className="input" placeholder={`Model (optional, default ${prov(form.provider)?.model || "required"})`} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            <input className="input" placeholder="Label (optional)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <button className="btn w-full" onClick={add} disabled={busy || form.key.length < 8}>{busy ? "Testing key…" : "Save and test"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
