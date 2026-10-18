/**
 * Brute-force protection for sign-in. In-memory (one process), so it resets on restart; the per-IP rate limit and captcha cover that gap.
 *  - 5 wrong passwords for the same email from the same IP  → that pair is locked 15 minutes
 *  - 25 wrong passwords for one email from anywhere          → that email is locked 15 minutes (a slow, distributed attack)
 *  - 40 wrong passwords from one IP across any emails        → that IP is locked 15 minutes (credential stuffing)
 * The pair rule means a stranger can't lock you out of your own account from their connection.
 */
const WINDOW = 15 * 60_000;
type Rec = { n: number; first: number; until: number };
const m = new Map<string, Rec>();
const LIMITS: [prefix: string, max: number][] = [["pair", 5], ["email", 25], ["ip", 40]];

const keys = (email: string, ip: string) => [`pair:${email}|${ip}`, `email:${email}`, `ip:${ip}`];
const prune = () => { if (m.size < 20_000) return; const now = Date.now(); for (const [k, r] of m) if (r.until < now && now - r.first > WINDOW) m.delete(k); };

/** Seconds the caller must wait, or 0 when sign-in may be attempted. */
export function lockedFor(email: string, ip: string, now = Date.now()): number {
  let wait = 0;
  for (const k of keys(email, ip)) { const r = m.get(k); if (r && r.until > now) wait = Math.max(wait, Math.ceil((r.until - now) / 1000)); }
  return wait;
}
export function recordFailure(email: string, ip: string, now = Date.now()) {
  prune();
  for (const k of keys(email, ip)) {
    let r = m.get(k);
    if (!r || now - r.first > WINDOW) r = { n: 0, first: now, until: 0 };
    r.n++;
    const max = LIMITS.find(([p]) => k.startsWith(p + ":"))![1];
    if (r.n >= max) { r.until = now + WINDOW; r.n = 0; r.first = now; }
    m.set(k, r);
  }
}
export function recordSuccess(email: string, ip: string) { m.delete(`pair:${email}|${ip}`); m.delete(`email:${email}`); }
export const clearLockouts = () => m.clear();
