import { complete } from "./llm";

/**
 * Scoring / outreach generation / conversation / SOP generation.
 * Runs in-process through the aiOS model layer (the user's own keys, with failover).
 * If AI_SERVICE_URL is set (e.g. the Python microservice in Docker) it is used instead.
 */
const REMOTE = process.env.AI_SERVICE_URL && process.env.AI_SERVICE_URL !== "inline" ? process.env.AI_SERVICE_URL : "";

async function remote<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${REMOTE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.AI_SERVICE_KEY && { "x-internal-key": process.env.AI_SERVICE_KEY }) }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`AI service ${path} ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}


async function completeJson(system: string, user: unknown, maxTokens = 1200): Promise<any> {
  let text = (await complete({
    system: system + "\nRespond ONLY with valid JSON. No markdown fences, no preamble.",
    prompt: typeof user === "string" ? user : JSON.stringify(user), maxTokens, json: true,
  })).trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(text);
}

// ── Scoring (rules + LLM read of website text) ─────────────────
const W = { industry_match: 20, size_fit: 10, growth: 10, recent_hiring: 5, geo_fit: 10, tech_signals: 10, website_quality: 5, pain_points: 15, buying_intent: 10, recency: 5, decision_maker: 10 };

function ruleScore(business: any, lead: any): Record<string, number> {
  const s: Record<string, number> = {};
  const industries: string[] = (business.industries ?? []).map((i: string) => i.toLowerCase());
  const li = (lead.industry ?? "").toLowerCase();
  s.industry_match = li && industries.some((i) => i.includes(li) || li.includes(i)) ? W.industry_match : li ? 8 : 5;
  const emp = lead.employeeCount, lo = business.sizeMin, hi = business.sizeMax;
  s.size_fit = emp && (lo || hi) ? ((!lo || emp >= lo) && (!hi || emp <= hi) ? W.size_fit : 3) : 5;
  s.decision_maker = lead.hasVerifiedContact ? W.decision_maker : 3;
  s.recency = (lead.createdDaysAgo ?? 99) <= 7 ? W.recency : 2;
  s.growth = lead.growthSignals && Object.keys(lead.growthSignals).length ? W.growth : 0;
  s.recent_hiring = lead.source === "jobs" ? W.recent_hiring : 0;
  s.geo_fit = W.geo_fit;
  return s;
}

async function scoreLocal(p: { business: any; lead: any }) {
  const { business, lead } = p;
  const s = ruleScore(business, lead);
  let llm: any = { pain_points: [], potential_need: "", website_quality: 3, tech_signals: 5, buying_intent: 3 };
  const excerpt = (lead.websiteExcerpt ?? "").slice(0, 6000);
  if (excerpt) {
    try {
      llm = await completeJson("You are a B2B sales analyst. Assess fit strictly from the evidence given. Never invent facts.", {
        our_business: business,
        prospect: { companyName: lead.companyName, industry: lead.industry, city: lead.city, country: lead.country, techStack: lead.techStack },
        prospect_website_text: excerpt,
        task: {
          pain_points: "list up to 4 likely pain points our services address, grounded in the website text",
          potential_need: "one sentence on why they might need us (or why not)",
          website_quality: `0-${W.website_quality}`, tech_signals: `0-${W.tech_signals} (existing software / stack relevance)`, buying_intent: `0-${W.buying_intent}`,
        },
      });
    } catch { /* keep defaults */ }
  }
  s.website_quality = Math.min(Number(llm.website_quality ?? 3) | 0, W.website_quality);
  s.tech_signals = Math.min(Number(llm.tech_signals ?? 5) | 0, W.tech_signals);
  s.buying_intent = Math.min(Number(llm.buying_intent ?? 3) | 0, W.buying_intent);
  s.pain_points = Math.min((llm.pain_points?.length ?? 0) * 4, W.pain_points);
  const score = Math.min(Object.values(s).reduce((a, b) => a + b, 0), 100);
  return { score, confidence: excerpt ? 80 : 55, breakdown: s, potentialNeed: llm.potential_need ?? "", painPoints: (llm.pain_points ?? []).slice(0, 4) as string[] };
}

// ── Outreach generation ────────────────────────────────────────
const GUARDRAILS = `Hard rules:
- Use ONLY facts provided in the input. Never invent news, numbers, names, or claims about the prospect.
- No spammy language, no false urgency, no misleading subject lines.
- Identify the sender's business honestly.
- Keep it human: short sentences, specific, zero corporate filler.
- If a calendar link is provided, offer it as a low-pressure next step.`;

async function emailLocal(ctx: any) {
  const f = ctx.followUp;
  const task = f ? `Write follow-up #${f.attempt} (brief, adds one new angle, references that you reached out before).` : "Write a first cold outreach email that reads like a thoughtful human wrote it specifically for this company.";
  const out = await completeJson(`You are an expert B2B copywriter writing on behalf of the sender business. ${GUARDRAILS}`, {
    sender_business: ctx.business, prospect: ctx.lead, language: ctx.language ?? "en", task,
    output: { subject: "string, <60 chars, specific not clickbait", body_html: "string, 80-140 words, simple HTML paragraphs, greeting uses contact name if given" },
  }, 900);
  return { subject: String(out.subject), body_html: String(out.body_html) };
}

async function whatsappLocal(ctx: any) {
  const out = await completeJson(`You write short, friendly, professional WhatsApp business messages. ${GUARDRAILS}`, {
    sender_business: ctx.business, prospect: ctx.lead, language: ctx.language ?? "en",
    output: { body: "string, 2-4 short lines, natural and localized, ends with a soft question" },
  }, 400);
  return { body: String(out.body) };
}

// ── Conversation agent ─────────────────────────────────────────
const INTENTS = ["question", "pricing", "objection", "interested", "meeting", "not_interested", "unsubscribe", "other"];

async function replyLocal(p: any) {
  const out = await completeJson(`You are a sales assistant continuing a real conversation on behalf of a business.
Rules:
- Ground every statement in the provided business facts. If asked something you don't know (pricing details, technical specifics, contracts), say a colleague will follow up — and set escalate=true.
- Follow the pricingPolicy exactly.
- If they want a meeting, share the calendar link if provided.
- Match the prospect's language.
- Be brief, warm, and honest. Never pressure.
Respond only with JSON.`, {
    business: p.business, prospect: p.lead, conversation_history: (p.history ?? []).slice(-12), new_inbound_message: p.inbound,
    output: {
      intent: `one of ${JSON.stringify(INTENTS)}`, reply: "the message to send back (plain text)",
      escalate: "boolean — true if a human must take over (custom quote, negotiation, complaint, anything uncertain)",
      escalate_reason: "short reason if escalate", stage_hint: "optional CRM stage: INTERESTED | MEETING_SCHEDULED | NEGOTIATION | LOST",
    },
  }, 800);
  out.escalate = Boolean(out.escalate);
  if (!INTENTS.includes(out.intent)) out.intent = "other";
  return out as { intent: string; reply: string; escalate: boolean; escalate_reason?: string; stage_hint?: string };
}

// ── SOP generation ─────────────────────────────────────────────
async function sopLocal(p: any) {
  const out = await completeJson(`You are an operations analyst. Convert a process into a clear, repeatable SOP.
Return JSON only:
{
 "title": short name,
 "department": one of Sales/Delivery/Finance/Marketing/Front Office/People/Operations/Engineering,
 "description": one sentence on when to use this,
 "trigger": "manual" | "event:<type>" | "schedule:<cron>",
 "steps": [{ "n": 1, "action": "imperative step", "tool": optional tool name, "owner": "human"|"agent:<role>" }],
 "automation": { "role": "<agent role that could run this end-to-end>", "input": { "task": "..." } } | null
}
Make steps concrete and ordered. If the process is fully automatable by one of our AI agents, fill "automation"; otherwise null.`, {
    our_business: p.business ?? {}, process_description: p.description, observed_activity: p.activity_log, available_agent_roles: p.roles ?? [],
  }, 1200);
  return { ...out, source: p.description ? "taught" : "observed" };
}

export const ai = {
  scoreLead: (p: unknown): Promise<{ score: number; confidence: number; breakdown: Record<string, number>; potentialNeed: string; painPoints: string[] }> =>
    REMOTE ? remote("/score", p) : scoreLocal(p as any),
  generateEmail: (p: unknown): Promise<{ subject: string; body_html: string }> => (REMOTE ? remote("/generate/email", p) : emailLocal(p)),
  generateWhatsApp: (p: unknown): Promise<{ body: string }> => (REMOTE ? remote("/generate/whatsapp", p) : whatsappLocal(p)),
  handleReply: (p: unknown) => (REMOTE ? remote<ReturnType<typeof replyLocal> extends Promise<infer R> ? R : never>("/conversation/reply", p) : replyLocal(p)),
  generateSop: (p: unknown): Promise<any> => (REMOTE ? remote("/sop/generate", p) : sopLocal(p)),
};
