"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Copy, Download, ExternalLink, Plus, Trash2 } from "lucide-react";
import { api, businessId, fetcher, token } from "@/lib/api";
import { toast } from "@/lib/toast";
import { usePrefs } from "@/components/Prefs";

type Win = [string, string];
type Cfg = { enabled: boolean; title: string; welcome: string; slug: string; timezone: string; hours: Record<string, Win[]>; types: { id: string; title: string; minutes: number; description?: string }[]; minNoticeHours: number; daysAhead: number; bufferMin: number; preferExternal: boolean; notifyEmail: string; joinUrl: string };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ZONES = ["Asia/Riyadh", "Asia/Dubai", "Asia/Karachi", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Singapore", "UTC"];
const copy = (v: string) => { navigator.clipboard?.writeText(v); toast("Copied"); };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function BookingsView({ tab }: { tab: string }) {
  const { t } = usePrefs();
  const [bid, setBid] = useState<string | null>(null);
  useEffect(() => setBid(businessId()), []);
  const settings = useSWR(bid ? `/businesses/${bid}/booking` : null, fetcher);
  const upcoming = useSWR(bid && tab === "upcoming" ? `/businesses/${bid}/bookings?scope=upcoming` : null, fetcher);
  const [cfg, setCfg] = useState<Cfg | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (settings.data?.config) setCfg(settings.data.config); }, [settings.data]);
  if (!bid) return <p className="text-sm text-ink/60">Create or select a company first (Settings → Business).</p>;
  if (!cfg) return <div className="h-32 animate-pulse rounded-2xl bg-line" />;
  const set = (p: Partial<Cfg>) => setCfg({ ...cfg, ...p });
  const url: string | null = settings.data?.publicUrl, feed: string | null = settings.data?.feedUrl, external: string | null = settings.data?.externalUrl;

  async function save(next: Cfg = cfg!) {
    setBusy(true);
    try { const { slug, ...rest } = next; await api(`/businesses/${bid}/booking`, { method: "PUT", body: JSON.stringify({ ...rest, ...(slug ? { slug } : {}) }) }); toast(t("Saved.")); settings.mutate(); }
    catch (e: any) { toast(e.message, "error"); }
    setBusy(false);
  }
  async function cancel(id: string) {
    if (!confirm("Cancel this booking?")) return;
    try { await api(`/businesses/${bid}/bookings/${id}/cancel`, { method: "POST" }); upcoming.mutate(); } catch (e: any) { toast(e.message, "error"); }
  }
  async function download() {
    const r = await fetch(`/v1/businesses/${bid}/bookings.ics`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!r.ok) return toast("Could not export", "error");
    const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = "bookings.ics"; a.click(); URL.revokeObjectURL(a.href);
  }
  const SaveBtn = <button className="btn" onClick={() => save()} disabled={busy}>{t("Save")}</button>;

  if (tab === "upcoming") return (
    <div className="card">
      {!upcoming.data && <div className="h-16 animate-pulse rounded-lg bg-line" />}
      {upcoming.data?.length === 0 && <p className="text-sm text-ink/60">No upcoming bookings yet. {cfg.enabled ? "Share your booking link to get the first one." : "Turn on your booking link to start."}</p>}
      <ul className="divide-y divide-line">{upcoming.data?.map((b: any) => (
        <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div><div className="font-semibold">{b.typeTitle}: {b.name}</div><div className="text-sm text-ink/60">{when(b.startsAt)} · {b.email}{b.phone ? ` · ${b.phone}` : ""}{b.source === "ai" ? " · booked by your AI" : ""}</div>{b.notes && <div className="mt-1 text-sm text-ink/70">{b.notes}</div>}</div>
          <button className="btn-ghost !py-1 text-danger" onClick={() => cancel(b.id)}>Cancel</button>
        </li>
      ))}</ul>
    </div>
  );

  if (tab === "link") return (
    <div className="card space-y-4">
      <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={cfg.enabled} onChange={(e) => set({ enabled: e.target.checked })} />Accept bookings through aiOS</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Page title<input className="input mt-1" value={cfg.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="text-sm font-medium">Link name<input className="input mt-1" value={cfg.slug} placeholder="auto-generated" onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></label>
        <label className="text-sm font-medium sm:col-span-2">Welcome message<input className="input mt-1" value={cfg.welcome} onChange={(e) => set({ welcome: e.target.value })} /></label>
        <label className="text-sm font-medium">Send booking alerts to<input className="input mt-1" type="email" placeholder="defaults to the account owner" value={cfg.notifyEmail} onChange={(e) => set({ notifyEmail: e.target.value })} /></label>
        <label className="text-sm font-medium">Meeting link (Zoom / Meet, optional)<input className="input mt-1" type="url" placeholder="https://" value={cfg.joinUrl} onChange={(e) => set({ joinUrl: e.target.value })} /></label>
      </div>
      {url && (
        <div className="rounded-xl bg-paper p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate"><b>Your booking link:</b> <code>{url}</code></span>
            <span className="flex gap-1"><button className="btn-ghost px-2 py-1" aria-label="Copy link" onClick={() => copy(url)}><Copy className="h-4 w-4" /></button><a className="btn-ghost px-2 py-1" href={url} target="_blank" rel="noreferrer" aria-label="Open"><ExternalLink className="h-4 w-4" /></a></span></div>
          <p className="mt-2 text-xs text-ink/60">{cfg.enabled ? "Your AI shares this link in emails, WhatsApp and follow-ups, so people pick their own time." : "Switch on and save, and your AI will start sharing it."}</p>
        </div>
      )}
      <div className="rounded-xl border border-line p-3 text-sm">
        <div className="font-semibold">Already use Cal.com or Calendly?</div>
        <p className="mt-1 text-ink/60">Your existing link is kept in Settings → Business ({external ? <code>{external}</code> : "not set"}). Choose which one your AI shares:</p>
        <label className="mt-2 flex items-center gap-2"><input type="radio" checked={!cfg.preferExternal} onChange={() => set({ preferExternal: false })} />The aiOS booking page above</label>
        <label className="mt-1 flex items-center gap-2"><input type="radio" checked={cfg.preferExternal} disabled={!external} onChange={() => set({ preferExternal: true })} />My Cal.com / Calendly link</label>
      </div>
      {SaveBtn}
    </div>
  );

  if (tab === "availability") return (
    <div className="card space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm font-medium sm:col-span-2">Time zone<select className="input mt-1" value={cfg.timezone} onChange={(e) => set({ timezone: e.target.value })}>{[...new Set([cfg.timezone, ...ZONES])].map((z) => <option key={z}>{z}</option>)}</select></label>
        <label className="text-sm font-medium">Minimum notice (hours)<input className="input mt-1" type="number" min={0} value={cfg.minNoticeHours} onChange={(e) => set({ minNoticeHours: +e.target.value })} /></label>
        <label className="text-sm font-medium">Book up to (days ahead)<input className="input mt-1" type="number" min={1} max={180} value={cfg.daysAhead} onChange={(e) => set({ daysAhead: +e.target.value })} /></label>
        <label className="text-sm font-medium">Buffer between meetings (min)<input className="input mt-1" type="number" min={0} max={120} value={cfg.bufferMin} onChange={(e) => set({ bufferMin: +e.target.value })} /></label>
      </div>
      <div className="space-y-2">{DAYS.map((name, d) => {
        const w = cfg.hours[String(d)] ?? [];
        const setW = (nw: Win[]) => set({ hours: { ...cfg.hours, [d]: nw } });
        return (
          <div key={d} className="flex flex-wrap items-center gap-2">
            <label className="flex w-36 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={w.length > 0} onChange={(e) => setW(e.target.checked ? [["09:00", "17:00"]] : [])} />{name}</label>
            {w.map((x, i) => (
              <span key={i} className="flex items-center gap-1">
                <input type="time" className="input !w-auto !py-1" value={x[0]} onChange={(e) => setW(w.map((y, j) => (j === i ? [e.target.value, y[1]] : y)))} />–
                <input type="time" className="input !w-auto !py-1" value={x[1]} onChange={(e) => setW(w.map((y, j) => (j === i ? [y[0], e.target.value] : y)))} />
                {w.length > 1 && <button className="px-1 text-ink/50" aria-label="Remove" onClick={() => setW(w.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>}
              </span>
            ))}
            {w.length > 0 && w.length < 4 && <button className="text-xs font-semibold text-signal" onClick={() => setW([...w, ["13:00", "17:00"]])}>+ split</button>}
            {w.length === 0 && <span className="text-sm text-ink/45">Unavailable</span>}
          </div>
        );
      })}</div>
      {SaveBtn}
    </div>
  );

  if (tab === "types") return (
    <div className="card space-y-3">
      {cfg.types.map((ty, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_8rem_auto]">
          <input className="input" aria-label="Name" value={ty.title} onChange={(e) => set({ types: cfg.types.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
          <select className="input" aria-label="Length" value={ty.minutes} onChange={(e) => set({ types: cfg.types.map((x, j) => (j === i ? { ...x, minutes: +e.target.value } : x)) })}>{[15, 20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}</select>
          <button className="btn-ghost text-danger" disabled={cfg.types.length < 2} aria-label="Remove" onClick={() => set({ types: cfg.types.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
          <input className="input sm:col-span-3" placeholder="Short description (optional)" value={ty.description ?? ""} onChange={(e) => set({ types: cfg.types.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
        </div>
      ))}
      <div className="flex gap-2"><button className="btn-ghost" disabled={cfg.types.length >= 8} onClick={() => set({ types: [...cfg.types, { id: `m${Date.now().toString(36)}`, title: "New meeting", minutes: 30 }] })}><Plus className="h-4 w-4" />Add meeting type</button>{SaveBtn}</div>
    </div>
  );

  return (
    <div className="card space-y-4 text-sm">
      <div><h3 className="font-bold">Download</h3><p className="mt-1 text-ink/60">A file with all upcoming bookings that opens in Google Calendar, Outlook and Apple Calendar.</p><button className="btn mt-2" onClick={download}><Download className="h-4 w-4" />Download .ics</button></div>
      <div className="border-t border-line pt-4"><h3 className="font-bold">Stay in sync automatically</h3>
        {feed ? (<><p className="mt-1 text-ink/60">Subscribe once and new bookings appear in your calendar by themselves. Keep this link private.</p>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-paper p-3"><code className="min-w-0 truncate">{feed}</code><button className="btn-ghost px-2 py-1" aria-label="Copy feed link" onClick={() => copy(feed)}><Copy className="h-4 w-4" /></button></div>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-ink/60"><li>Google Calendar: Other calendars → From URL.</li><li>Outlook: Add calendar → Subscribe from web.</li><li>Apple Calendar: File → New Calendar Subscription.</li></ul></>)
          : <p className="mt-1 text-ink/60">Save your booking settings first (Booking link tab) and the subscription link will appear here.</p>}
      </div>
      <p className="text-xs text-ink/50">Guests also get an “Add to calendar” link in their confirmation.</p>
    </div>
  );
}
