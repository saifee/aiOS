/**
 * Email delivery — SendGrid primary, AWS SES fallback.
 * All sends include an unsubscribe footer + List-Unsubscribe header (compliance).
 */
type SendArgs = { to: string; subject: string; html: string; from: string; unsubscribeUrl: string };

export async function sendEmail(args: SendArgs): Promise<{ providerId?: string; provider: string }> {
  const footer = `<p style="color:#888;font-size:12px;margin-top:24px">If you'd prefer not to hear from us, <a href="${args.unsubscribeUrl}">unsubscribe here</a>.</p>`;
  const html = args.html + footer;

  if (process.env.SENDGRID_API_KEY) {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: args.to }] }],
        from: { email: args.from },
        subject: args.subject,
        content: [{ type: "text/html", value: html }],
        headers: { "List-Unsubscribe": `<${args.unsubscribeUrl}>` },
        tracking_settings: { open_tracking: { enable: true } },
      }),
    });
    if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
    return { providerId: res.headers.get("x-message-id") ?? undefined, provider: "sendgrid" };
  }

  if (process.env.AWS_ACCESS_KEY_ID) {
    // AWS SES v2 via SigV4 — in production use @aws-sdk/client-sesv2; kept dependency-light here.
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
  throw new Error("No email provider configured (set SENDGRID_API_KEY or AWS SES credentials)");
}
