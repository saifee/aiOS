/**
 * Email delivery. The platform superadmin picks ONE provider in Settings (SMTP, Gmail, Outlook/Office 365,
 * Resend, Mailgun, Mailjet, SendGrid, Brevo, Postmark, Maileroo). If none is configured there, the
 * SENDGRID_API_KEY / AWS SES environment variables keep working exactly as before.
 * Marketing-style sends include an unsubscribe footer + List-Unsubscribe header; system mail (invites,
 * test messages) is sent with `system: true` and carries neither.
 */
import { lookup } from "dns/promises";
import { isPrivateIp } from "./netguard";

export const EMAIL_PROVIDERS = ["smtp", "gmail", "outlook", "resend", "mailgun", "mailjet", "sendgrid", "brevo", "postmark", "maileroo"] as const;
export type EmailProviderId = (typeof EMAIL_PROVIDERS)[number];

/** Decrypted, ready-to-use settings. Built by the API from the encrypted platform setting. */
export type EmailRuntimeConfig = {
  provider: EmailProviderId;
  fromEmail: string; fromName?: string; replyTo?: string;
  user?: string; secret?: string; secret2?: string;      // SMTP user/password, or API key (+ Mailjet secret)
  host?: string; port?: number; secure?: boolean;         // custom SMTP
  domain?: string; region?: "us" | "eu";                  // Mailgun
};

const SMTP_PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
  gmail: { host: "smtp.gmail.com", port: 465, secure: true },
  outlook: { host: "smtp.office365.com", port: 587, secure: false },
  maileroo: { host: "smtp.maileroo.com", port: 587, secure: false },
};

type SendArgs = { to: string; subject: string; html: string; from: string; unsubscribeUrl?: string; system?: boolean; replyTo?: string };

let resolver: (() => Promise<EmailRuntimeConfig | null>) | null = null;
/** The app registers how to find the configured provider (kept out of this package so it has no DB dependency). */
export function setEmailResolver(fn: (() => Promise<EmailRuntimeConfig | null>) | null) { resolver = fn; }

const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();   // header-injection guard
const addr = (email: string, name?: string) => (name ? `${clean(name).replace(/[<>"]/g, "")} <${clean(email)}>` : clean(email));

async function readErr(res: Response) { const t = (await res.text().catch(() => "")).slice(0, 300); return `${res.status} ${t}`.trim(); }
const post = (url: string, headers: Record<string, string>, body: string | URLSearchParams, extra: Record<string, string> = {}) =>
  fetch(url, { method: "POST", headers: { ...headers, ...extra }, body, signal: AbortSignal.timeout(20_000) });

/** SMTP hosts are typed by an admin; refuse private/internal addresses so this can't be used to probe the network. */
async function assertPublicHost(host: string) {
  if (process.env.ALLOW_PRIVATE_SMTP === "true") return;
  const ips = await lookup(host, { all: true }).catch(() => { throw new Error(`Cannot resolve mail server "${host}"`); });
  if (!ips.length || ips.some((a) => isPrivateIp(a.address))) throw new Error("Mail server must be a public address");
}

async function viaSmtp(c: EmailRuntimeConfig, a: SendArgs, html: string, headers: Record<string, string>) {
  const preset = SMTP_PRESETS[c.provider];
  const host = preset?.host ?? c.host, port = preset?.port ?? c.port ?? 587, secure = preset?.secure ?? !!c.secure;
  if (!host) throw new Error("SMTP host is not set");
  await assertPublicHost(host);
  const nodemailer: any = await import("nodemailer");
  const tx = (nodemailer.default ?? nodemailer).createTransport({
    host, port, secure, requireTLS: !secure && process.env.ALLOW_PRIVATE_SMTP !== "true", auth: c.user ? { user: c.user, pass: c.secret ?? "" } : undefined,
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 20_000,
  });
  const info = await tx.sendMail({ from: addr(c.fromEmail, c.fromName), to: a.to, replyTo: a.replyTo || c.replyTo || undefined, subject: clean(a.subject), html, headers });
  return { providerId: info.messageId as string | undefined, provider: c.provider };
}

async function viaApi(c: EmailRuntimeConfig, a: SendArgs, html: string, headers: Record<string, string>) {
  const from = addr(c.fromEmail, c.fromName), subject = clean(a.subject), replyTo = a.replyTo || c.replyTo || undefined;
  const key = c.secret ?? "";
  if (!key) throw new Error("API key is not set");
  switch (c.provider) {
    case "resend": {
      const r = await post("https://api.resend.com/emails", { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        JSON.stringify({ from, to: [a.to], subject, html, reply_to: replyTo, headers }));
      if (!r.ok) throw new Error(`Resend ${await readErr(r)}`);
      return { providerId: (await r.json().catch(() => ({})))?.id as string | undefined, provider: "resend" };
    }
    case "mailgun": {
      if (!c.domain) throw new Error("Mailgun sending domain is not set");
      const base = c.region === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
      const f = new URLSearchParams({ from, to: a.to, subject, html });
      if (replyTo) f.set("h:Reply-To", replyTo);
      for (const [k, v] of Object.entries(headers)) f.set(`h:${k}`, v);
      const r = await post(`${base}/v3/${encodeURIComponent(c.domain)}/messages`, { Authorization: "Basic " + Buffer.from(`api:${key}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, f);
      if (!r.ok) throw new Error(`Mailgun ${await readErr(r)}`);
      return { providerId: (await r.json().catch(() => ({})))?.id as string | undefined, provider: "mailgun" };
    }
    case "mailjet": {
      if (!c.secret2) throw new Error("Mailjet secret key is not set");
      const r = await post("https://api.mailjet.com/v3.1/send", { Authorization: "Basic " + Buffer.from(`${key}:${c.secret2}`).toString("base64"), "Content-Type": "application/json" },
        JSON.stringify({ Messages: [{ From: { Email: c.fromEmail, Name: c.fromName }, To: [{ Email: a.to }], Subject: subject, HTMLPart: html, ...(replyTo && { ReplyTo: { Email: replyTo } }), Headers: headers }] }));
      if (!r.ok) throw new Error(`Mailjet ${await readErr(r)}`);
      return { provider: "mailjet" };
    }
    case "sendgrid": {
      const r = await post("https://api.sendgrid.com/v3/mail/send", { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        JSON.stringify({ personalizations: [{ to: [{ email: a.to }] }], from: { email: c.fromEmail, name: c.fromName }, ...(replyTo && { reply_to: { email: replyTo } }), subject, content: [{ type: "text/html", value: html }], headers }));
      if (!r.ok) throw new Error(`SendGrid ${await readErr(r)}`);
      return { providerId: r.headers.get("x-message-id") ?? undefined, provider: "sendgrid" };
    }
    case "brevo": {
      const r = await post("https://api.brevo.com/v3/smtp/email", { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
        JSON.stringify({ sender: { email: c.fromEmail, name: c.fromName }, to: [{ email: a.to }], subject, htmlContent: html, ...(replyTo && { replyTo: { email: replyTo } }), headers }));
      if (!r.ok) throw new Error(`Brevo ${await readErr(r)}`);
      return { providerId: (await r.json().catch(() => ({})))?.messageId as string | undefined, provider: "brevo" };
    }
    case "postmark": {
      const r = await post("https://api.postmarkapp.com/email", { "X-Postmark-Server-Token": key, "Content-Type": "application/json", Accept: "application/json" },
        JSON.stringify({ From: from, To: a.to, Subject: subject, HtmlBody: html, ReplyTo: replyTo, Headers: Object.entries(headers).map(([Name, Value]) => ({ Name, Value })), MessageStream: "outbound" }));
      if (!r.ok) throw new Error(`Postmark ${await readErr(r)}`);
      return { providerId: (await r.json().catch(() => ({})))?.MessageID as string | undefined, provider: "postmark" };
    }
    default: throw new Error(`Unsupported provider ${c.provider}`);
  }
}

export async function sendEmail(args: SendArgs): Promise<{ providerId?: string; provider: string }> {
  const footer = args.system || !args.unsubscribeUrl ? "" : `<p style="color:#888;font-size:12px;margin-top:24px">If you'd prefer not to hear from us, <a href="${args.unsubscribeUrl}">unsubscribe here</a>.</p>`;
  const html = args.html + footer;
  const headers: Record<string, string> = args.system || !args.unsubscribeUrl ? {} : { "List-Unsubscribe": `<${args.unsubscribeUrl}>` };

  const cfg = resolver ? await resolver().catch(() => null) : null;
  if (cfg) {
    // Providers only deliver from a sender they have verified, so the configured address wins;
    // the sender the caller asked for becomes Reply-To so answers still reach the right person.
    const wanted = args.from && args.from.toLowerCase() !== cfg.fromEmail.toLowerCase() && /^[^@\s]+@[^@\s]+$/.test(args.from) ? args.from : undefined;
    const a = { ...args, replyTo: args.replyTo ?? wanted };
    return cfg.provider in SMTP_PRESETS || cfg.provider === "smtp" ? viaSmtp(cfg, a, html, headers) : viaApi(cfg, a, html, headers);
  }

  if (process.env.SENDGRID_API_KEY) {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: args.to }] }],
        from: { email: args.from },
        subject: args.subject,
        content: [{ type: "text/html", value: html }],
        ...(Object.keys(headers).length && { headers }),
        ...(!args.system && { tracking_settings: { open_tracking: { enable: true } } }),
      }),
    });
    if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
    return { providerId: res.headers.get("x-message-id") ?? undefined, provider: "sendgrid" };
  }

  if (process.env.AWS_ACCESS_KEY_ID) {
    const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2" as any).catch(() => ({} as any));
    if (SESv2Client) {
      const client = new SESv2Client({ region: process.env.AWS_SES_REGION });
      const out = await client.send(new SendEmailCommand({
        FromEmailAddress: args.from,
        Destination: { ToAddresses: [args.to] },
        Content: { Simple: { Subject: { Data: args.subject }, Body: { Html: { Data: html } } } },
      }));
      return { providerId: out.MessageId, provider: "ses" };
    }
  }
  throw new Error("No email provider is set up. Open Settings → Email and connect one (SMTP, Gmail, Outlook, Resend, Mailgun, …).");
}
