import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** Post-call: summary + sentiment + intent from the transcript. */
export async function summarizeCall(transcript: { role: string; text: string }[], _businessId: string) {
  if (!transcript.length) return null;
  const text = transcript.map((t) => `${t.role}: ${t.text}`).join("\n");
  const resp = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5", max_tokens: 400,
    system: "Summarize this phone call for a CRM. Respond ONLY as JSON: {summary, sentiment (positive|neutral|negative), intent, language (ISO code like ar or en)}.",
    messages: [{ role: "user", content: text.slice(0, 6000) }],
  });
  const raw = resp.content.filter((c) => c.type === "text").map((c: any) => c.text).join("").replace(/^```(json)?|```$/gm, "").trim();
  try { return JSON.parse(raw); } catch { return { summary: raw.slice(0, 500), sentiment: "neutral", intent: "unknown" }; }
}
