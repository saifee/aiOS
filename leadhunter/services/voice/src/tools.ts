import { prisma } from "@leadhunter/db";
import { sendWhatsAppText, redirectCallToHuman } from "@leadhunter/integrations";

/** Function tools the receptionist can call mid-call (OpenAI Realtime format). */
export const receptionistTools = [
  { type: "function", name: "lookup_client", description: "Find an existing client by phone or company name.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { type: "function", name: "create_lead", description: "Create a new prospect record for a first-time caller.", parameters: { type: "object", properties: { companyName: { type: "string" }, contactName: { type: "string" }, need: { type: "string" } }, required: ["companyName"] } },
  { type: "function", name: "book_meeting", description: "Book a meeting/callback.", parameters: { type: "object", properties: { leadId: { type: "string" }, whenISO: { type: "string" }, topic: { type: "string" } }, required: ["whenISO"] } },
  { type: "function", name: "take_message", description: "Record a message for the team.", parameters: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } },
  { type: "function", name: "transfer_call", description: "Flag the call for urgent human transfer.", parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] } },
];

export async function runReceptionistTool(name: string, args: any, ctx: { businessId: string; callSid: string; fromNumber: string }) {
  switch (name) {
    case "lookup_client": {
      const lead = await prisma.lead.findFirst({ where: { businessId: ctx.businessId, OR: [{ companyName: { contains: args.query, mode: "insensitive" } }, { phones: { has: ctx.fromNumber } }] }, include: { contacts: true } });
      return lead ? { found: true, company: lead.companyName, stage: lead.stage, contact: lead.contacts[0]?.name } : { found: false };
    }
    case "create_lead": {
      const lead = await prisma.lead.create({ data: { businessId: ctx.businessId, companyName: args.companyName, phones: [ctx.fromNumber], potentialNeed: args.need, dedupeKey: `${args.companyName}-${ctx.fromNumber}`, source: "phone_call", stage: "FOUND" } }).catch(() => null);
      if (lead) await prisma.call.updateMany({ where: { callSid: ctx.callSid }, data: { leadId: lead.id } });
      return { created: !!lead, leadId: lead?.id };
    }
    case "book_meeting": {
      let leadId = args.leadId;
      if (!leadId) { const c = await prisma.call.findUnique({ where: { callSid: ctx.callSid } }); leadId = c?.leadId ?? undefined; }
      if (!leadId) return { booked: false, reason: "no lead on call yet" };
      await prisma.meeting.create({ data: { leadId, provider: "phone", startsAt: new Date(args.whenISO), endsAt: new Date(args.whenISO) } });
      await prisma.lead.update({ where: { id: leadId }, data: { stage: "MEETING_SCHEDULED" } });
      return { booked: true };
    }
    case "take_message":
      await prisma.call.updateMany({ where: { callSid: ctx.callSid }, data: { intent: "message", summary: args.message } });
      return { saved: true };
    case "transfer_call": {
      const biz = ctx.businessId ? await prisma.business.findUnique({ where: { id: ctx.businessId }, select: { notificationPrefs: true } }) : null;
      const toNumber = (biz?.notificationPrefs as any)?.transferNumber || process.env.DEFAULT_TRANSFER_NUMBER;
      await prisma.call.updateMany({ where: { callSid: ctx.callSid }, data: { status: "transferred", intent: "urgent" } });
      if (!toNumber) return { transferring: false, note: "No human transfer number configured; take a message instead." };
      try { await redirectCallToHuman(ctx.callSid, toNumber); return { transferring: true, note: "Tell the caller you're connecting them now." }; }
      catch (e: any) { return { transferring: false, error: String(e.message), note: "Transfer failed; offer to take a message." }; }
    }
    default: return { error: "unknown tool" };
  }
}
