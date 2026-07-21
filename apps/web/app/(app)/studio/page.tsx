"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher, api, businessId } from "@/lib/api";

export default function Studio() {
  const [tab, setTab] = useState<"build" | "create" | "publish">("build");
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Studio</h1>
        <p className="text-sm text-ink/60">Ship code, generate creative, and publish content — run by your AI teams.</p>
      </header>
      <div className="flex gap-2">
        {(["build", "create", "publish"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-2 text-sm ${tab === t ? "bg-ink text-white" : "btn-ghost"}`}>
            {t === "build" ? "Dev Swarm" : t === "create" ? "Creative" : "Social"}
          </button>
        ))}
      </div>
      {tab === "build" && <Swarm />}
      {tab === "create" && <Creative />}
      {tab === "publish" && <Social />}
    </div>
  );
}

function Swarm() {
  const bid = businessId();
  const { data: runs, mutate } = useSWR(bid ? `/businesses/${bid}/swarm/runs` : null, fetcher);
  const [task, setTask] = useState(""); const [repo, setRepo] = useState(""); const [busy, setBusy] = useState(false); const [open, setOpen] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    await api(`/businesses/${bid}/swarm/run`, { method: "POST", body: JSON.stringify({ task, repo: repo || undefined }) }).catch((e) => alert(e.message));
    setBusy(false); setTask(""); mutate();
  }
  return (
    <div className="space-y-4">
      <div className="card">
        <p className="mb-2 text-xs text-ink/60">Claude architects & codes → Gemini reviews → OpenAI fixes → tests run in a sandbox → opens a GitHub PR (with your approval).</p>
        <textarea className="input h-24" placeholder="Describe the feature or fix, e.g. 'Add a CSV export endpoint for leads with date filtering and a unit test.'" value={task} onChange={(e) => setTask(e.target.value)} />
        <div className="mt-2 flex gap-2">
          <input className="input" placeholder="GitHub repo (owner/name) — optional" value={repo} onChange={(e) => setRepo(e.target.value)} />
          <button className="btn whitespace-nowrap" disabled={busy || task.length < 3} onClick={run}>{busy ? "Swarming…" : "Run swarm"}</button>
        </div>
      </div>
      {(runs ?? []).map((r: any) => (
        <div key={r.id} className="card">
          <div className="flex items-center justify-between">
            <div className="font-medium">{r.task}</div>
            <span className={`tag ${r.status === "awaiting_approval" ? "bg-amber/15 text-amber" : r.status === "failed" ? "bg-danger/15 text-danger" : ""}`}>{r.status.replace(/_/g, " ")}</span>
          </div>
          <div className="mt-1 text-xs text-ink/50">{r.testsPassed != null && `tests ${r.testsPassed ? "passed ✓" : "failed ✗"} · `}{(r.changeset ?? []).length} files {r.prUrl && <>· <a className="text-signal" href={r.prUrl} target="_blank">view PR ↗</a></>}</div>
          <button className="mt-2 text-xs text-signal" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide pipeline" : "Show pipeline"}</button>
          {open === r.id && (
            <div className="mt-2 space-y-1 border-l-2 border-signalSoft pl-4 text-xs">
              {(r.stages ?? []).map((s: any, i: number) => (
                <div key={i}><span className="font-medium">{s.role}</span> <span className="text-ink/40">({s.model})</span></div>
              ))}
            </div>
          )}
          {r.status === "awaiting_approval" && <p className="mt-2 text-xs text-amber">Approve the PR from the Command Center to ship it.</p>}
        </div>
      ))}
      {runs?.length === 0 && <p className="text-sm text-ink/50">No swarm runs yet.</p>}
    </div>
  );
}

function Creative() {
  const bid = businessId();
  const { data: media, mutate } = useSWR(bid ? `/businesses/${bid}/media` : null, fetcher);
  const [prompt, setPrompt] = useState(""); const [busy, setBusy] = useState(false);
  async function gen() { setBusy(true); await api(`/businesses/${bid}/media/image`, { method: "POST", body: JSON.stringify({ prompt }) }).catch((e) => alert(e.message)); setBusy(false); setPrompt(""); mutate(); }
  return (
    <div className="space-y-4">
      <div className="card flex gap-2">
        <input className="input" placeholder="Describe an image — 'Spark-ED launch banner, GCC school theme, teal accents'" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <button className="btn whitespace-nowrap" disabled={busy || prompt.length < 3} onClick={gen}>{busy ? "Generating…" : "Generate"}</button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(media ?? []).map((m: any) => (
          <div key={m.id} className="card p-2">
            {m.kind === "image" && m.url ? <img src={m.url} alt={m.prompt} className="aspect-square w-full rounded object-cover" /> : <div className="flex aspect-square items-center justify-center rounded bg-paper text-xs text-ink/40">{m.kind} · {m.status}</div>}
            <p className="mt-1 truncate text-xs text-ink/50">{m.prompt}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Social() {
  const bid = businessId();
  const { data: posts, mutate } = useSWR(bid ? `/businesses/${bid}/social` : null, fetcher);
  const [form, setForm] = useState({ channel: "linkedin", content: "" });
  async function create() { await api(`/businesses/${bid}/social`, { method: "POST", body: JSON.stringify(form) }); setForm({ ...form, content: "" }); mutate(); }
  async function publish(id: string) { const r = await api(`/social/${id}/publish`, { method: "POST" }); if (r.error) alert(r.error); mutate(); }
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex gap-2">
          <select className="input w-40" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
            {["linkedin", "facebook", "instagram", "x"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className="input" placeholder="Post content…" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          <button className="btn" onClick={create}>Draft</button>
        </div>
      </div>
      {(posts ?? []).map((p: any) => (
        <div key={p.id} className="card flex items-center justify-between">
          <div><span className="tag">{p.channel}</span> <span className="ml-2 text-sm">{p.content}</span></div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink/50">{p.status}</span>
            {["draft", "scheduled", "failed"].includes(p.status) && <button className="btn-ghost text-xs" onClick={() => publish(p.id)}>Publish now</button>}
          </div>
        </div>
      ))}
      {posts?.length === 0 && <p className="text-sm text-ink/50">No posts yet. Connect networks in Settings → Integrations to publish.</p>}
    </div>
  );
}
