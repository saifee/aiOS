/**
 * WhatsApp Business Cloud API (Meta official API).
 * Business-initiated conversations MUST use pre-approved message templates;
 * free-form messages are only allowed inside the 24h customer-service window
 * after the customer replies. Both paths are supported.
 */
const BASE = "https://graph.facebook.com/v20.0";

/** Per-business WhatsApp credentials (Settings → Integrations). Falls back to the server-wide environment variables. */
export type WhatsAppCfg = { phoneNumberId: string; token: string };

export async function sendWhatsAppTemplate(to: string, templateName: string, lang: string, params: string[], cfg?: WhatsAppCfg | null) {
  return waPost(cfg, {
    messaging_product: "whatsapp", to, type: "template",
    template: {
      name: templateName, language: { code: lang },
      components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }],
    },
  });
}

export async function sendWhatsAppText(to: string, body: string, cfg?: WhatsAppCfg | null) {
  return waPost(cfg, { messaging_product: "whatsapp", to, type: "text", text: { body } });
}

async function waPost(cfg: WhatsAppCfg | null | undefined, payload: unknown): Promise<{ providerId?: string }> {
  const phoneNumberId = cfg?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = cfg?.token || process.env.WHATSAPP_CLOUD_TOKEN;
  if (!phoneNumberId || !token) throw new Error("WhatsApp is not connected. Add your Cloud API details under Settings → Integrations.");
  const res = await fetch(`${BASE}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json: any = await res.json();
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${JSON.stringify(json)}`);
  return { providerId: json.messages?.[0]?.id };
}
