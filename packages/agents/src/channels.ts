import { prisma } from "@leadhunter/db";
import { decrypt, type WhatsAppCfg } from "@leadhunter/integrations";

/** The business's own WhatsApp Cloud API connection (null = fall back to server-wide env variables). */
export async function whatsappCfg(businessId?: string | null): Promise<WhatsAppCfg | null> {
  if (!businessId) return null;
  try {
    const row: any = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "whatsapp_cloud" } } });
    const enc = row?.credentials?.enc; const phoneNumberId = row?.config?.phoneNumberId;
    if (!enc || !phoneNumberId || row.status !== "connected") return null;
    const c = JSON.parse(decrypt(enc));
    return c.accessToken ? { phoneNumberId: String(phoneNumberId), token: String(c.accessToken) } : null;
  } catch { return null; }
}
