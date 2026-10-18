import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendEmail, setEmailResolver, type EmailRuntimeConfig } from "../email";

const base: EmailRuntimeConfig = { provider: "resend", fromEmail: "hello@acme.com", fromName: "Acme", secret: "KEY123" };
let calls: { url: string; init: any }[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => { calls.push({ url, init }); return new Response(JSON.stringify({ id: "m1", MessageID: "pm1", messageId: "b1" }), { status: 200 }); }));
});
afterEach(() => { setEmailResolver(null); vi.unstubAllGlobals(); });
const use = (c: Partial<EmailRuntimeConfig>) => setEmailResolver(async () => ({ ...base, ...c }));
const send = (o: any = {}) => sendEmail({ to: "a@b.com", subject: "Hi\r\nBcc: x@y.com", html: "<p>x</p>", from: "ignored@else.com", system: true, ...o });

describe("email providers", () => {
  it("Resend: bearer key, configured sender wins, caller's sender becomes reply-to, no header injection", async () => {
    use({}); await send();
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].init.headers.Authorization).toBe("Bearer KEY123");
    const body = JSON.parse(calls[0].init.body);
    expect(body.from).toBe("Acme <hello@acme.com>"); expect(body.reply_to).toBe("ignored@else.com"); expect(body.subject).not.toMatch(/[\r\n]/);
  });
  it("Mailgun: basic auth, EU region and domain", async () => {
    use({ provider: "mailgun", domain: "mg.acme.com", region: "eu" }); await send();
    expect(calls[0].url).toBe("https://api.eu.mailgun.net/v3/mg.acme.com/messages");
    expect(calls[0].init.headers.Authorization).toBe("Basic " + Buffer.from("api:KEY123").toString("base64"));
  });
  it("Mailjet needs key + secret", async () => {
    use({ provider: "mailjet" }); await expect(send()).rejects.toThrow(/secret key/);
    use({ provider: "mailjet", secret2: "SEC" }); await send();
    expect(calls[0].init.headers.Authorization).toBe("Basic " + Buffer.from("KEY123:SEC").toString("base64"));
    expect(JSON.parse(calls[0].init.body).Messages[0].To[0].Email).toBe("a@b.com");
  });
  it.each([["sendgrid", "https://api.sendgrid.com/v3/mail/send"], ["brevo", "https://api.brevo.com/v3/smtp/email"], ["postmark", "https://api.postmarkapp.com/email"]])("%s hits its endpoint", async (p, url) => {
    use({ provider: p as any }); await send(); expect(calls[0].url).toBe(url);
  });
  it("reports provider errors without leaking the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("domain not verified", { status: 403 })));
    use({}); const e: any = await send().catch((x) => x);
    expect(e.message).toMatch(/Resend 403 domain not verified/); expect(e.message).not.toContain("KEY123");
  });
  it("refuses a private SMTP host", async () => {
    use({ provider: "smtp", host: "127.0.0.1", port: 25, user: "u", secret: "p" });
    await expect(send()).rejects.toThrow(/public address/);
  });
  it("system mail has no unsubscribe footer; marketing mail does", async () => {
    use({}); await send({ unsubscribeUrl: "https://x/u/1" });
    expect(JSON.parse(calls[0].init.body).html).not.toContain("unsubscribe");
    await send({ system: false, unsubscribeUrl: "https://x/u/1" });
    expect(JSON.parse(calls[1].init.body).html).toContain("unsubscribe");
  });
  it("says what to do when nothing is configured", async () => {
    delete process.env.SENDGRID_API_KEY; delete process.env.AWS_ACCESS_KEY_ID;
    await expect(send()).rejects.toThrow(/Settings → Email/);
  });
});
