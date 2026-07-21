import Anthropic from "@anthropic-ai/sdk";

/**
 * Provider-agnostic LLM router. The dev swarm assigns different roles to
 * different models — each is a real, callable API:
 *   claude     → Anthropic (architect + coder)
 *   gemini     → Google Generative Language (reviewer)
 *   openai     → OpenAI Chat Completions (fixer)
 *   perplexity → Perplexity Sonar (researcher, web-grounded)
 * Missing a provider's key? It throws a clear error; the swarm degrades to
 * Claude for that role rather than failing the whole run.
 */
export type Provider = "claude" | "gemini" | "openai" | "perplexity";

const anthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function callModel(provider: Provider, opts: { system?: string; prompt: string; maxTokens?: number; json?: boolean }): Promise<string> {
  const max = opts.maxTokens ?? 2000;
  try {
    switch (provider) {
      case "claude": {
        const r = await anthropic().messages.create({
          model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5", max_tokens: max,
          system: opts.system, messages: [{ role: "user", content: opts.prompt }],
        });
        return r.content.filter((c) => c.type === "text").map((c: any) => c.text).join("\n");
      }
      case "gemini": {
        if (!process.env.GEMINI_API_KEY) throw new Error("no gemini key");
        const model = process.env.GEMINI_MODEL || "gemini-1.5-pro";
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ system_instruction: opts.system ? { parts: [{ text: opts.system }] } : undefined, contents: [{ parts: [{ text: opts.prompt }] }], generationConfig: { maxOutputTokens: max, ...(opts.json && { responseMimeType: "application/json" }) } }),
        });
        if (!r.ok) throw new Error(`gemini ${r.status}`);
        const j: any = await r.json();
        return j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
      }
      case "openai": {
        if (!process.env.OPENAI_API_KEY) throw new Error("no openai key");
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4o", max_tokens: max, ...(opts.json && { response_format: { type: "json_object" } }), messages: [...(opts.system ? [{ role: "system", content: opts.system }] : []), { role: "user", content: opts.prompt }] }),
        });
        if (!r.ok) throw new Error(`openai ${r.status}`);
        const j: any = await r.json();
        return j.choices?.[0]?.message?.content ?? "";
      }
      case "perplexity": {
        if (!process.env.PERPLEXITY_API_KEY) throw new Error("no perplexity key");
        const r = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST", headers: { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: process.env.PERPLEXITY_MODEL || "sonar", messages: [...(opts.system ? [{ role: "system", content: opts.system }] : []), { role: "user", content: opts.prompt }] }),
        });
        if (!r.ok) throw new Error(`perplexity ${r.status}`);
        const j: any = await r.json();
        return j.choices?.[0]?.message?.content ?? "";
      }
    }
  } catch (e) {
    // Graceful degradation: fall back to Claude for any provider that isn't configured.
    if (provider !== "claude") return callModel("claude", opts);
    throw e;
  }
}

export function parseJson<T = any>(text: string): T {
  const cleaned = text.replace(/^```(json)?/gm, "").replace(/```$/gm, "").trim();
  const start = cleaned.search(/[[{]/);
  return JSON.parse(start >= 0 ? cleaned.slice(start) : cleaned);
}
