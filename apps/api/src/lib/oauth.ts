import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export type Provider = "google" | "microsoft";
export const CONSUMERS_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad"; // personal Microsoft accounts (Outlook, Hotmail, Live)

export function appBase() { return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, ""); }
export function redirectUri(p: Provider) { return `${appBase()}/v1/auth/oauth/${p}/callback`; }

export function providerConfig(p: Provider) {
  if (p === "google") {
    const id = process.env.GOOGLE_OAUTH_CLIENT_ID, secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!id || !secret) return null;
    return { id, secret, authUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", scope: "openid email profile" };
  }
  const id = process.env.MICROSOFT_OAUTH_CLIENT_ID, secret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
  if (!id || !secret) return null;
  const t = encodeURIComponent(process.env.MICROSOFT_TENANT || "common");
  return { id, secret, authUrl: `https://login.microsoftonline.com/${t}/oauth2/v2.0/authorize`, tokenUrl: `https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, scope: "openid email profile" };
}
export const isProvider = (v: string): v is Provider => v === "google" || v === "microsoft";

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest();
/** Short-lived signed state: ties the browser that started sign-in to the one that finishes it. */
export function signState(secret: string, payload: { p: Provider; n: string }) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + 10 * 60_000 }));
  return `${body}.${b64(mac(secret, body))}`;
}
export function readState(secret: string, state: string): { p: Provider; n: string } | null {
  const [body, sig] = String(state).split(".");
  if (!body || !sig) return null;
  const want = mac(secret, body), got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try { const j = JSON.parse(Buffer.from(body, "base64url").toString()); return j.exp > Date.now() && isProvider(j.p) && typeof j.n === "string" ? j : null; } catch { return null; }
}
export const newNonce = () => randomBytes(24).toString("base64url");

export type Profile = { subject: string; email: string; name: string; verified: boolean };

/** Reads the id_token returned directly by the provider's token endpoint (TLS + client secret), then checks audience, issuer, expiry and nonce. */
export function profileFromIdToken(p: Provider, idToken: string, o: { clientId: string; nonce: string }): Profile {
  const part = String(idToken).split(".")[1];
  if (!part) throw new Error("Invalid sign-in response");
  const c = JSON.parse(Buffer.from(part, "base64url").toString());
  if (c.aud !== o.clientId) throw new Error("Sign-in response was meant for another app");
  if (c.nonce !== o.nonce) throw new Error("Sign-in session mismatch. Please try again.");
  if (!c.exp || c.exp * 1000 < Date.now()) throw new Error("Sign-in expired. Please try again.");
  const iss = String(c.iss || "");
  if (p === "google" ? !/^(https:\/\/)?accounts\.google\.com$/.test(iss) : !iss.startsWith("https://login.microsoftonline.com/")) throw new Error("Unexpected sign-in issuer");
  if (!c.sub) throw new Error("Invalid sign-in response");
  const email = String(c.email || (p === "microsoft" && String(c.preferred_username || "").includes("@") ? c.preferred_username : "")).trim().toLowerCase();
  if (!email) throw new Error("Your account did not share an email address.");
  // Google vouches for the address. Microsoft only does for personal accounts (or when the domain owner is verified); work-account emails are editable by the tenant admin.
  const verified = p === "google" ? c.email_verified === true || c.email_verified === "true" : c.tid === CONSUMERS_TENANT || c.xms_edov === true || c.xms_edov === "1";
  return { subject: String(c.sub), email, name: String(c.name || email.split("@")[0]).slice(0, 120), verified };
}
