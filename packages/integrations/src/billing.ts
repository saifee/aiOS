import Stripe from "stripe";

/** Stripe client (lazy so the app boots without a key in dev). */
let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not set");
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  }
  return _stripe;
}

/** Plans + limits. priceId comes from your Stripe dashboard (env-overridable). */
export type PlanKey = "TRIAL" | "STARTER" | "GROWTH" | "SCALE" | "ENTERPRISE";
export const PLANS: Record<PlanKey, { name: string; priceMonthly: number; priceId?: string; limits: { leads: number; outreach: number; calls: number; seats: number; agents: number } }> = {
  TRIAL:      { name: "Trial",      priceMonthly: 0,    limits: { leads: 100,    outreach: 200,   calls: 50,    seats: 1,  agents: 5 } },
  STARTER:    { name: "Starter",    priceMonthly: 149,  priceId: process.env.STRIPE_PRICE_STARTER, limits: { leads: 1000,  outreach: 2000,  calls: 300,   seats: 3,  agents: 10 } },
  GROWTH:     { name: "Growth",     priceMonthly: 499,  priceId: process.env.STRIPE_PRICE_GROWTH,  limits: { leads: 5000,  outreach: 10000, calls: 1500,  seats: 10, agents: 27 } },
  SCALE:      { name: "Scale",      priceMonthly: 1499, priceId: process.env.STRIPE_PRICE_SCALE,   limits: { leads: 25000, outreach: 60000, calls: 8000,  seats: 30, agents: 27 } },
  ENTERPRISE: { name: "Enterprise", priceMonthly: 0,    limits: { leads: 1e9,    outreach: 1e9,   calls: 1e9,   seats: 999, agents: 27 } },
};

export async function createCheckout(customerId: string, priceId: string, successUrl: string, cancelUrl: string) {
  return stripe().checkout.sessions.create({
    mode: "subscription", customer: customerId, line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl, cancel_url: cancelUrl, allow_promotion_codes: true,
  });
}

export async function createPortal(customerId: string, returnUrl: string) {
  return stripe().billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
}

export async function ensureCustomer(existingId: string | null | undefined, email: string, name?: string) {
  if (existingId) return existingId;
  const c = await stripe().customers.create({ email, name });
  return c.id;
}

export function verifyWebhook(payload: string | Buffer, sig: string) {
  return stripe().webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET!);
}
