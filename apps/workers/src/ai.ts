/** Client for the Python AI microservice (scoring, generation, conversation). */
const BASE = process.env.AI_SERVICE_URL || "http://localhost:8000";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI service ${path} ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const ai = {
  scoreLead: (payload: unknown) => post<{ score: number; confidence: number; breakdown: Record<string, number>; potentialNeed: string; painPoints: string[] }>("/score", payload),
  generateEmail: (payload: unknown) => post<{ subject: string; body_html: string }>("/generate/email", payload),
  generateWhatsApp: (payload: unknown) => post<{ body: string }>("/generate/whatsapp", payload),
  handleReply: (payload: unknown) => post<{ intent: string; reply: string; escalate: boolean; escalate_reason?: string; stage_hint?: string }>("/conversation/reply", payload),
};
