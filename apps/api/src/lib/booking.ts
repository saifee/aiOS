import { randomBytes } from "crypto";

export type Window = [string, string];
export type BookingType = { id: string; title: string; minutes: number; description?: string };
export type BookingConfig = {
  enabled: boolean; slug: string; title: string; welcome: string; timezone: string;
  hours: Record<string, Window[]>; types: BookingType[];
  minNoticeHours: number; daysAhead: number; bufferMin: number;
  feedToken: string; preferExternal: boolean; notifyEmail: string; joinUrl: string;
};

export const token = (n = 18) => randomBytes(n).toString("base64url");
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "book";
export const DEFAULT_HOURS: Record<string, Window[]> = { "0": [["09:00", "17:00"]], "1": [["09:00", "17:00"]], "2": [["09:00", "17:00"]], "3": [["09:00", "17:00"]], "4": [["09:00", "17:00"]] }; // Sun–Thu

/** Booking settings live inside the existing Business.branding JSON, so there is nothing to migrate. */
export function readConfig(biz: { name: string; timezone?: string | null; branding?: any }): BookingConfig {
  const b = (biz.branding as any)?.booking ?? {};
  return {
    enabled: b.enabled ?? false, slug: b.slug ?? "", title: b.title ?? `Book time with ${biz.name}`, welcome: b.welcome ?? "Pick a time that suits you.",
    timezone: b.timezone || biz.timezone || "Asia/Riyadh", hours: b.hours ?? DEFAULT_HOURS,
    types: Array.isArray(b.types) && b.types.length ? b.types : [{ id: "intro", title: "Intro call", minutes: 30, description: "A short call to talk about what you need." }],
    minNoticeHours: b.minNoticeHours ?? 4, daysAhead: b.daysAhead ?? 30, bufferMin: b.bufferMin ?? 0,
    feedToken: b.feedToken ?? "", preferExternal: b.preferExternal ?? false, notifyEmail: b.notifyEmail ?? "", joinUrl: b.joinUrl ?? "",
  };
}

export function validTimezone(tz: string) { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }

function offsetMs(ts: number, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ts;
}
/** Wall-clock time in a named time zone → UTC milliseconds. */
export function zonedToUtc(date: string, hhmm: string, tz: string) {
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetMs(guess, tz);
  t = guess - offsetMs(t, tz);
  return t;
}
export const weekdayOf = (date: string) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

/** Free start times (ISO strings) for one local date. `busy` are confirmed bookings around that date. */
export function slotsFor(cfg: BookingConfig, type: BookingType, date: string, busy: { startsAt: Date; endsAt: Date }[], now = Date.now()): string[] {
  const out: string[] = [];
  const step = Math.min(type.minutes, 30) * 60_000, dur = type.minutes * 60_000, buf = cfg.bufferMin * 60_000;
  const earliest = now + cfg.minNoticeHours * 3600_000, latest = now + cfg.daysAhead * 86400_000;
  for (const [from, to] of cfg.hours[String(weekdayOf(date))] ?? []) {
    const end = zonedToUtc(date, to, cfg.timezone);
    for (let t = zonedToUtc(date, from, cfg.timezone); t + dur <= end; t += step) {
      if (t < earliest || t > latest) continue;
      if (busy.some((b) => b.startsAt.getTime() - buf < t + dur && b.endsAt.getTime() + buf > t)) continue;
      out.push(new Date(t).toISOString());
    }
  }
  return out;
}

// ── iCalendar (.ics) ───────────────────────────────────────────────
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const fold = (l: string) => (l.length <= 74 ? l : l.match(/.{1,73}/g)!.join("\r\n "));
export type IcsEvent = { uid: string; start: Date; end: Date; title: string; description?: string; url?: string; location?: string; cancelled?: boolean };
export function toIcs(name: string, events: IcsEvent[]) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//aiOS//Bookings//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(name)}`];
  for (const e of events) lines.push("BEGIN:VEVENT", `UID:${e.uid}@aios`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`, `SUMMARY:${esc(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []), ...(e.location ? [`LOCATION:${esc(e.location)}`] : []), ...(e.url ? [`URL:${e.url}`] : []), `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT");
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
export const googleCalUrl = (title: string, s: Date, e: Date, details = "") =>
  `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${stamp(s)}/${stamp(e)}&details=${encodeURIComponent(details)}`;
