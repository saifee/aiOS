"use client";
import { useEffect, useState } from "react";
import { CalendarPlus, CheckCircle2, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { Captcha } from "@/components/Captcha";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Public booking page: no sign-in. /book?b=<link-name> to book, /book?t=<token> to view or cancel a booking. */
export default function Book() {
  const [slug, setSlug] = useState(""); const [tok, setTok] = useState("");
  const [info, setInfo] = useState<any>(null); const [err, setErr] = useState("");
  const [type, setType] = useState<any>(null); const [date, setDate] = useState(""); const [slots, setSlots] = useState<string[] | null>(null); const [slot, setSlot] = useState("");
  const [f, setF] = useState({ name: "", email: "", phone: "", notes: "" }); const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [captcha, setCaptcha] = useState(""); const [capKey, setCapKey] = useState(0);
  const [mine, setMine] = useState<any>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search); setSlug(q.get("b") ?? ""); setTok(q.get("t") ?? "");
    if (q.get("t")) api(`/public/booking/${q.get("t")}`).then(setMine).catch((e) => setErr(e.message));
    else if (q.get("b")) api(`/public/book/${q.get("b")}`).then((d) => { setInfo(d); setType(d.types[0]); }).catch((e) => setErr(e.message));
    else setErr("This booking link is incomplete.");
  }, []);
  useEffect(() => {
    if (!date || !type || !slug) return;
    setSlots(null); setSlot("");
    api(`/public/book/${slug}/slots?type=${type.id}&date=${date}`).then((r) => setSlots(r.slots)).catch((e) => setErr(e.message));
  }, [date, type, slug]);

  const days = info ? Array.from({ length: Math.min(info.daysAhead, 60) }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }).filter((d) => info.openWeekdays.includes(d.getDay())).slice(0, 21) : [];
  const fmtTime = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const fmtFull = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(new Date(iso));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try { setDone(await api(`/public/book/${slug}`, { method: "POST", body: JSON.stringify({ type: type.id, startsAt: slot, ...(captcha && { captcha }), name: f.name, email: f.email, phone: f.phone || undefined, notes: f.notes || undefined }) })); }
    catch (e: any) { setCapKey((k) => k + 1); setErr(e.message); setSlot(""); setSlots(null); if (date) api(`/public/book/${slug}/slots?type=${type.id}&date=${date}`).then((r) => setSlots(r.slots)).catch(() => {}); }
    setBusy(false);
  }
  async function cancel() { if (!confirm("Cancel this booking?")) return; try { await api(`/public/booking/${tok}/cancel`, { method: "POST" }); setMine({ ...mine, status: "cancelled" }); } catch (e: any) { setErr(e.message); } }
  const cal = (b: any) => (<div className="mt-4 flex flex-wrap gap-2"><a className="btn-ghost" href={b.googleUrl} target="_blank" rel="noreferrer"><CalendarPlus className="h-4 w-4" />Google Calendar</a><a className="btn-ghost" href={b.icsUrl}>Apple / Outlook (.ics)</a></div>);

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-4 sm:p-8">
      {err && !info && !mine && <p role="alert" className="card text-danger">{err}</p>}
      {mine && (
        <div className="card">
          <h1 className="text-2xl font-extrabold">{mine.status === "cancelled" ? "Booking cancelled" : "Your booking"}</h1>
          <p className="mt-2">{mine.typeTitle} with {mine.name}</p><p className="text-ink/60">{fmtFull(mine.startsAt)} ({mine.timezone})</p>
          {mine.joinUrl && mine.status !== "cancelled" && <p className="mt-2"><a className="text-signal underline" href={mine.joinUrl}>Join link</a></p>}
          {mine.status !== "cancelled" && <>{cal(mine)}<button className="mt-4 text-sm font-semibold text-danger" onClick={cancel}>Cancel this booking</button></>}
          {err && <p role="alert" className="mt-3 text-sm text-danger">{err}</p>}
        </div>
      )}
      {info && !done && (
        <div className="card">
          <h1 className="text-2xl font-extrabold">{info.title}</h1><p className="mt-1 text-ink/60">{info.welcome}</p>
          <div className="mt-4 flex flex-wrap gap-2">{info.types.map((t: any) => <button key={t.id} onClick={() => { setType(t); setSlot(""); }} className={`rounded-xl border px-3 py-2 text-start text-sm ${type?.id === t.id ? "border-signal bg-signalSoft" : "border-line"}`}><b>{t.title}</b><span className="ms-2 inline-flex items-center gap-1 text-ink/55"><Clock className="h-3 w-3" />{t.minutes} min</span>{t.description && <span className="block text-xs text-ink/55">{t.description}</span>}</button>)}</div>
          <h2 className="mb-2 mt-5 text-sm font-bold">Pick a day <span className="font-normal text-ink/50">(times shown in your local time)</span></h2>
          <div className="flex flex-wrap gap-2">{days.map((d) => <button key={ymd(d)} onClick={() => setDate(ymd(d))} className={`rounded-lg border px-3 py-1.5 text-sm ${date === ymd(d) ? "border-signal bg-signalSoft font-semibold" : "border-line"}`}>{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</button>)}</div>
          {date && (<>
            <h2 className="mb-2 mt-5 text-sm font-bold">Pick a time</h2>
            {!slots ? <div className="h-10 animate-pulse rounded-lg bg-line" /> : slots.length === 0 ? <p className="text-sm text-ink/60">No times left that day. Try another day.</p> :
              <div className="flex flex-wrap gap-2">{slots.map((s) => <button key={s} onClick={() => setSlot(s)} className={`rounded-lg border px-3 py-1.5 text-sm ${slot === s ? "border-signal bg-signal text-white" : "border-line"}`}>{fmtTime(s)}</button>)}</div>}
          </>)}
          {slot && (
            <form onSubmit={submit} className="mt-5 space-y-3 border-t border-line pt-4">
              <p className="text-sm font-semibold">{fmtFull(slot)}</p>
              <label className="block text-sm font-medium">Your name<input className="input mt-1" required maxLength={120} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
              <label className="block text-sm font-medium">Email<input className="input mt-1" type="email" required autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
              <label className="block text-sm font-medium">Phone / WhatsApp (optional)<input className="input mt-1" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
              <label className="block text-sm font-medium">Anything we should know? (optional)<textarea className="input mt-1" rows={3} maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
              <Captcha onToken={setCaptcha} resetKey={capKey} />
              {err && <p role="alert" className="text-sm text-danger">{err}</p>}
              <button className="btn w-full py-2.5" disabled={busy}>{busy ? "Booking…" : "Confirm booking"}</button>
            </form>
          )}
        </div>
      )}
      {done && (
        <div className="card text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-ok" /><h1 className="mt-2 text-2xl font-extrabold">You're booked</h1>
          <p className="mt-2">{done.typeTitle}</p><p className="text-ink/60">{fmtFull(done.startsAt)}</p>
          {done.joinUrl && <p className="mt-2"><a className="text-signal underline" href={done.joinUrl}>Join link</a></p>}
          <div className="flex justify-center">{cal(done)}</div>
          <p className="mt-4 text-xs text-ink/50">A confirmation was emailed to you. <a className="underline" href={`/book?t=${done.token}`}>Change or cancel</a></p>
        </div>
      )}
    </main>
  );
}
