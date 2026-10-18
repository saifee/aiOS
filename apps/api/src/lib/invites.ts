import { createHash, randomBytes } from "crypto";

export const INVITE_DAYS = 7;
export const newInviteToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const validTokenShape = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(t);
const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
export const joinLink = (token: string) => `${appUrl()}/join?t=${token}`;
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]!);

export function inviteHtml(opts: { inviter: string; workspace: string; role?: string; link: string; days: number }) {
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#12203f">
  <h2 style="margin:0 0 12px">You're invited to aiOS</h2>
  <p>${esc(opts.inviter)} invited you to join <b>${esc(opts.workspace)}</b>${opts.role ? ` as ${esc(opts.role.toLowerCase())}` : ""}.</p>
  <p style="margin:24px 0"><a href="${esc(opts.link)}" style="background:#3a5bff;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">Join aiOS</a></p>
  <p style="color:#667;font-size:13px">This link works once and expires in ${opts.days} days. If the button doesn't work, paste this into your browser:<br>${esc(opts.link)}</p>
  <p style="color:#889;font-size:12px">Didn't expect this? You can ignore the email; nothing happens unless you open the link.</p></div>`;
}
