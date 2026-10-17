import { prisma } from "@leadhunter/db";
import { configureStripe, decrypt, encrypt, encryptionConfigured } from "@leadhunter/integrations";

/** Payment-method settings, stored in PlatformSetting("payment_methods"). Secrets are encrypted at rest. */
export type ManualMethod = { id: string; type: "bank_transfer" | "cash" | "paypal" | "wallet" | "other"; label: string; instructions: string; enabled: boolean };
export type PaymentConfig = {
  stripe: { enabled: boolean; publishableKey?: string; secretKeyEnc?: string; secretHint?: string; webhookSecretEnc?: string; webhookHint?: string; prices?: Record<string, string> };
  manual: ManualMethod[];
};
const KEY = "payment_methods";
const db: any = prisma;
const empty = (): PaymentConfig => ({ stripe: { enabled: false }, manual: [] });
let cache: { at: number; cfg: PaymentConfig } | null = null;

export async function loadPaymentConfig(force = false): Promise<PaymentConfig> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.cfg;
  let cfg = empty();
  try { const row = await db.platformSetting.findUnique({ where: { key: KEY } }); if (row?.value) cfg = { ...empty(), ...(row.value as any) }; } catch { /* table missing: run the upgrade SQL */ }
  applyStripe(cfg);
  cache = { at: Date.now(), cfg };
  return cfg;
}

function applyStripe(cfg: PaymentConfig) {
  try {
    const s = cfg.stripe;
    if (!s?.enabled || !encryptionConfigured()) return configureStripe(null);
    configureStripe({ secretKey: s.secretKeyEnc ? decrypt(s.secretKeyEnc) : undefined, webhookSecret: s.webhookSecretEnc ? decrypt(s.webhookSecretEnc) : undefined, prices: s.prices as any });
  } catch { configureStripe(null); }
}

const last4 = (v: string) => (v.length > 4 ? `…${v.slice(-4)}` : "…");

export type StripeInput = { enabled: boolean; publishableKey?: string; secretKey?: string; webhookSecret?: string; prices?: Record<string, string> };
export async function savePaymentConfig(input: { stripe?: StripeInput; manual?: Omit<ManualMethod, "id">[] & { id?: string }[] }) {
  const cur = await loadPaymentConfig(true);
  const next: PaymentConfig = JSON.parse(JSON.stringify(cur));
  if (input.stripe) {
    const s = input.stripe;
    const needsEnc = !!(s.secretKey || s.webhookSecret);
    if (needsEnc && !encryptionConfigured()) throw Object.assign(new Error("Set a real ENCRYPTION_KEY on the server before saving payment secrets."), { statusCode: 400 });
    next.stripe.enabled = s.enabled;
    if (s.publishableKey !== undefined) next.stripe.publishableKey = s.publishableKey;
    if (s.secretKey) { next.stripe.secretKeyEnc = encrypt(s.secretKey); next.stripe.secretHint = last4(s.secretKey); }
    if (s.webhookSecret) { next.stripe.webhookSecretEnc = encrypt(s.webhookSecret); next.stripe.webhookHint = last4(s.webhookSecret); }
    if (s.prices) next.stripe.prices = Object.fromEntries(Object.entries(s.prices).filter(([, v]) => !!v));
  }
  if (input.manual) {
    next.manual = input.manual.slice(0, 20).map((m: any, i: number) => ({ id: m.id || `m${Date.now().toString(36)}${i}`, type: m.type, label: m.label, instructions: m.instructions ?? "", enabled: m.enabled !== false }));
  }
  await db.platformSetting.upsert({ where: { key: KEY }, update: { value: next }, create: { key: KEY, value: next } });
  cache = { at: Date.now(), cfg: next };
  applyStripe(next);
  return next;
}

/** Admin view: never returns the encrypted blobs, only hints. */
export function adminView(cfg: PaymentConfig) {
  const s = cfg.stripe;
  return {
    stripe: { enabled: !!s.enabled, publishableKey: s.publishableKey ?? "", secretSet: !!s.secretKeyEnc, secretHint: s.secretHint ?? "", webhookSet: !!s.webhookSecretEnc, webhookHint: s.webhookHint ?? "", prices: s.prices ?? {} },
    manual: cfg.manual,
  };
}
/** Customer view: which ways of paying exist, plus the instructions for manual ones. */
export function publicView(cfg: PaymentConfig) {
  return { stripe: !!cfg.stripe.enabled && !!cfg.stripe.secretKeyEnc, manual: cfg.manual.filter((m) => m.enabled).map((m) => ({ id: m.id, type: m.type, label: m.label, instructions: m.instructions })) };
}
export const clearPaymentCache = () => { cache = null; };
