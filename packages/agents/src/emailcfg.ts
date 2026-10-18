import { prisma } from "@leadhunter/db";
import { decrypt, encrypt, encryptionConfigured, EMAIL_PROVIDERS, setEmailResolver, type EmailProviderId, type EmailRuntimeConfig } from "@leadhunter/integrations";

/** Platform email settings, stored in PlatformSetting("email_provider"). Passwords / API keys are encrypted at rest and never returned. */
export type EmailSetting = {
  enabled: boolean; provider: EmailProviderId; fromEmail: string; fromName?: string; replyTo?: string;
  user?: string; host?: string; port?: number; secure?: boolean; domain?: string; region?: "us" | "eu";
  secretEnc?: string; secretHint?: string; secret2Enc?: string; secret2Hint?: string;
};
export type EmailInput = Omit<EmailSetting, "secretEnc" | "secretHint" | "secret2Enc" | "secret2Hint"> & { secret?: string; secret2?: string };

const KEY = "email_provider";
const db: any = prisma;
let cache: { at: number; cfg: EmailSetting | null } | null = null;
const hint = (v: string) => (v.length > 4 ? `…${v.slice(-4)}` : "…");

export async function loadEmailSetting(force = false): Promise<EmailSetting | null> {
  if (!force && cache && Date.now() - cache.at < 30_000) return cache.cfg;
  let cfg: EmailSetting | null = null;
  try { const row = await db.platformSetting.findUnique({ where: { key: KEY } }); if (row?.value?.provider) cfg = row.value as EmailSetting; } catch { /* table missing */ }
  cache = { at: Date.now(), cfg };
  return cfg;
}

/** Decrypted settings for sending, or null when email is not set up here (the env fallback then applies). */
export async function emailRuntime(): Promise<EmailRuntimeConfig | null> {
  const s = await loadEmailSetting();
  if (!s?.enabled || !s.fromEmail || !encryptionConfigured()) return null;
  try {
    return { provider: s.provider, fromEmail: s.fromEmail, fromName: s.fromName, replyTo: s.replyTo, user: s.user, host: s.host, port: s.port, secure: s.secure, domain: s.domain, region: s.region,
      secret: s.secretEnc ? decrypt(s.secretEnc) : undefined, secret2: s.secret2Enc ? decrypt(s.secret2Enc) : undefined };
  } catch { return null; }   // ENCRYPTION_KEY changed: fall back to env, and the settings page tells the admin to re-enter
}

export async function saveEmailSetting(input: EmailInput): Promise<EmailSetting> {
  if (!EMAIL_PROVIDERS.includes(input.provider)) throw Object.assign(new Error("Unknown email provider"), { statusCode: 400 });
  const cur = await loadEmailSetting(true);
  const sameProvider = cur?.provider === input.provider;
  const needsEnc = !!(input.secret || input.secret2);
  if (needsEnc && !encryptionConfigured()) throw Object.assign(new Error("Set a real ENCRYPTION_KEY on the server before saving email credentials."), { statusCode: 400 });
  const next: EmailSetting = {
    enabled: input.enabled, provider: input.provider, fromEmail: input.fromEmail, fromName: input.fromName || undefined, replyTo: input.replyTo || undefined,
    user: input.user || undefined, host: input.host || undefined, port: input.port, secure: input.secure, domain: input.domain || undefined, region: input.region,
    // keep stored secrets unless a new one is typed (switching provider drops the old provider's secrets)
    secretEnc: sameProvider ? cur?.secretEnc : undefined, secretHint: sameProvider ? cur?.secretHint : undefined,
    secret2Enc: sameProvider ? cur?.secret2Enc : undefined, secret2Hint: sameProvider ? cur?.secret2Hint : undefined,
  };
  if (input.secret) { next.secretEnc = encrypt(input.secret); next.secretHint = hint(input.secret); }
  if (input.secret2) { next.secret2Enc = encrypt(input.secret2); next.secret2Hint = hint(input.secret2); }
  await db.platformSetting.upsert({ where: { key: KEY }, update: { value: next }, create: { key: KEY, value: next } });
  cache = { at: Date.now(), cfg: next };
  return next;
}

export function emailAdminView(s: EmailSetting | null) {
  if (!s) return { configured: false, enabled: false, provider: "smtp", fromEmail: "", fromName: "", replyTo: "", user: "", host: "", port: 587, secure: false, domain: "", region: "us", secretSet: false, secretHint: "", secret2Set: false, secret2Hint: "", envFallback: envFallback() };
  return { configured: true, enabled: s.enabled, provider: s.provider, fromEmail: s.fromEmail, fromName: s.fromName ?? "", replyTo: s.replyTo ?? "", user: s.user ?? "", host: s.host ?? "", port: s.port ?? 587, secure: !!s.secure,
    domain: s.domain ?? "", region: s.region ?? "us", secretSet: !!s.secretEnc, secretHint: s.secretHint ?? "", secret2Set: !!s.secret2Enc, secret2Hint: s.secret2Hint ?? "", envFallback: envFallback() };
}
const envFallback = () => (process.env.SENDGRID_API_KEY ? "sendgrid" : process.env.AWS_ACCESS_KEY_ID ? "ses" : null);

setEmailResolver(emailRuntime);
