/** Twilio helpers for the AI Receptionist & outbound voice/SMS. */
const BASE = "https://api.twilio.com/2010-04-01";
function auth() { return "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"); }

export async function sendSms(to: string, body: string) {
  if (!process.env.TWILIO_ACCOUNT_SID) throw new Error("Twilio not configured");
  const form = new URLSearchParams({ To: to, From: process.env.TWILIO_PHONE_NUMBER!, Body: body });
  const res = await fetch(`${BASE}/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST", headers: { Authorization: auth(), "Content-Type": "application/x-www-form-urlencoded" }, body: form,
  });
  return res.json();
}

/** Live-transfer a call to a human (used when the receptionist detects urgency). */
export function transferTwiml(toNumber: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial>${toNumber}</Dial></Response>`;
}
