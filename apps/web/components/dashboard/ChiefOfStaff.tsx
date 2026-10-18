"use client";
import useSWR from "swr";
import { useEffect, useRef, useState } from "react";
import { BellRing, CalendarClock, Mail, Send, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import { api, businessId, fetcher } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { toast } from "@/lib/toast";

type Msg = { from: "cos" | "me"; text: string };
const hours = Array.from({ length: 24 }, (_, h) => h);
const hLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;

/** Your Chief of Staff: greets you with today's briefing when you sign in and answers follow-up questions like a chat. */
export function ChiefOfStaff() {
  const { data: me } = useMe();
  const [bid, setBid] = useState<string | null>(null);
  useEffect(() => setBid(businessId()), []);
  const { data: b } = useSWR(bid ? `/businesses/${bid}/chief-of-staff/briefing` : null, fetcher);
  const { data: prefs, mutate } = useSWR("/me/chief-of-staff", fetcher);
  const [msgs, setMsgs] = useState<Msg[]>([]); const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const first = (me?.user.name || "").split(" ")[0];

  useEffect(() => {
    if (!b) return;
    const lines = [`${new Date().getHours() < 12 ? "Good morning" : "Hello"}${first ? " " + first : ""}. Here is your briefing.`, b.headlines.join(" · "),
      b.attention.length ? "Needs you:\n" + b.attention.map((a: string) => "• " + a).join("\n") : "Nothing needs your attention right now.",
      ...(b.today.length ? ["Today:\n" + b.today.map((t: any) => `• ${t.when} · ${t.title} with ${t.who}`).join("\n")] : []),
      ...(b.next.length ? ["Coming up:\n" + b.next.map((t: any) => `• ${t.when} · ${t.title} with ${t.who}`).join("\n")] : [])];
    setMsgs([{ from: "cos", text: lines.join("\n\n") }]);
  }, [b, first]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs, busy]);

  async function ask(q = text) {
    if (!q.trim() || !bid || busy) return;
    setMsgs((m) => [...m, { from: "me", text: q }]); setText(""); setBusy(true);
    try { const r = await api(`/businesses/${bid}/command`, { method: "POST", body: JSON.stringify({ text: q }) }); setMsgs((m) => [...m, { from: "cos", text: r.reply || "Done." }]); }
    catch (e: any) { setMsgs((m) => [...m, { from: "cos", text: e.message }]); }
    setBusy(false);
  }
  const save = async (p: { email: boolean; hour: number }) => {
    try { await api("/me/chief-of-staff", { method: "PUT", body: JSON.stringify({ ...p, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Riyadh" }) }); mutate(); toast("Saved."); }
    catch (e: any) { toast(e.message, "error"); }
  };
  const sendNow = async () => { try { await api("/me/chief-of-staff/send-now", { method: "POST" }); toast(`Sent to ${me?.user.email}`); } catch (e: any) { toast(e.message, "error"); } };

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-signalSoft text-signal"><UserRoundCheck className="h-4 w-4" /></span>Your Chief of Staff</h3>
        <Link href="/bookings" className="flex items-center gap-1 text-xs font-semibold text-signal"><CalendarClock className="h-3.5 w-3.5" />Bookings</Link>
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl bg-paper p-3" aria-live="polite">
        {!b && <div className="h-16 animate-pulse rounded-lg bg-line" />}
        {msgs.map((m, i) => <p key={i} className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.from === "me" ? "ms-8 bg-signal text-white" : "me-8 bg-surface"}`}>{m.text}</p>)}
        {busy && <p className="me-8 rounded-2xl bg-surface px-3 py-2 text-sm text-ink/55">Working on it…</p>}
        <div ref={end} />
      </div>
      <div className="flex flex-wrap gap-2">{["What should I focus on today?", "Who needs a follow-up?", "Summarise this week"].map((q) => <button key={q} className="rounded-full border border-line px-3 py-1 text-xs text-ink/70 hover:bg-paper" onClick={() => ask(q)}>{q}</button>)}</div>
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="Ask your Chief of Staff…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} />
        <button className="btn" onClick={() => ask()} disabled={busy} aria-label="Send"><Send className="h-4 w-4" /></button>
      </div>
      {me && !me.aiReady && <p className="text-xs text-amber">Questions need an AI key. <Link href="/settings#keys" className="underline">Add one</Link>. The briefing above works without it.</p>}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!prefs?.email} onChange={(e) => save({ email: e.target.checked, hour: prefs?.hour ?? 7 })} /><Mail className="h-4 w-4 text-ink/55" />Email me this every day at</label>
        <select className="input !w-auto !py-1" value={prefs?.hour ?? 7} onChange={(e) => save({ email: !!prefs?.email, hour: +e.target.value })} aria-label="Time of day">{hours.map((h) => <option key={h} value={h}>{hLabel(h)}</option>)}</select>
        <button className="btn-ghost ms-auto !py-1" onClick={sendNow}><BellRing className="h-4 w-4" />Email it now</button>
      </div>
    </section>
  );
}
