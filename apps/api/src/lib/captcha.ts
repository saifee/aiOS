import { FastifyReply, FastifyRequest } from "fastify";

export type CaptchaProvider = "turnstile" | "recaptcha";
const URLS: Record<CaptchaProvider, string> = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  recaptcha: "https://www.google.com/recaptcha/api/siteverify",
};

/** Bot protection is on when a provider, site key and secret are all set. Cloudflare Turnstile or Google reCAPTCHA (v2 checkbox). */
export function captchaConfig(): { provider: CaptchaProvider; siteKey: string; secret: string } | null {
  const provider = String(process.env.CAPTCHA_PROVIDER || "").toLowerCase() as CaptchaProvider;
  const siteKey = process.env.CAPTCHA_SITE_KEY, secret = process.env.CAPTCHA_SECRET;
  return (provider === "turnstile" || provider === "recaptcha") && siteKey && secret ? { provider, siteKey, secret } : null;
}

/** True when the token is genuine. Fails closed: a provider outage blocks the action rather than letting bots through. */
export async function verifyCaptcha(token: unknown, ip?: string): Promise<boolean> {
  const c = captchaConfig();
  if (!c) return true;
  if (typeof token !== "string" || token.length < 10 || token.length > 4096) return false;
  try {
    const r = await fetch(URLS[c.provider], {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(6000),
      body: new URLSearchParams({ secret: c.secret, response: token, ...(ip && { remoteip: ip }) }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!j.success) return false;
    // The token must have been issued for this site, not harvested from another one.
    if (j.hostname && process.env.APP_URL) { try { if (j.hostname !== new URL(process.env.APP_URL).hostname) return false; } catch { /* ignore */ } }
    return true;
  } catch { return false; }
}

/** Use at the top of a public handler. Returns true if the request may continue; otherwise it has already replied. */
export async function guardCaptcha(req: FastifyRequest, reply: FastifyReply, token: unknown): Promise<boolean> {
  if (!captchaConfig()) return true;
  if (await verifyCaptcha(token, req.ip)) return true;
  reply.code(400).send({ error: "Please complete the security check and try again.", captcha: true });
  return false;
}

/** Extra CSP sources the chosen captcha widget needs. */
export function captchaCsp() {
  const c = captchaConfig();
  if (!c) return { script: "", frame: "", connect: "" };
  return c.provider === "turnstile"
    ? { script: " https://challenges.cloudflare.com", frame: " https://challenges.cloudflare.com", connect: " https://challenges.cloudflare.com" }
    : { script: " https://www.google.com https://www.gstatic.com", frame: " https://www.google.com", connect: " https://www.google.com" };
}
