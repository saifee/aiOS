import { complete } from "./llm";

/**
 * Role-based model picker used by the dev swarm. Each role prefers a provider, but every call goes
 * through the user's key chain, so it degrades gracefully to whatever keys the workspace has.
 */
export type Provider = "claude" | "gemini" | "openai" | "perplexity";
const MAP: Record<Provider, string> = { claude: "anthropic", gemini: "gemini", openai: "openai", perplexity: "perplexity" };

export async function callModel(provider: Provider, opts: { system?: string; prompt: string; maxTokens?: number; json?: boolean }): Promise<string> {
  return complete({ ...opts, maxTokens: opts.maxTokens ?? 2000, prefer: MAP[provider] });
}

export function parseJson<T = any>(text: string): T {
  const cleaned = text.replace(/^```(json)?/gm, "").replace(/```$/gm, "").trim();
  const start = cleaned.search(/[[{]/);
  return JSON.parse(start >= 0 ? cleaned.slice(start) : cleaned);
}
