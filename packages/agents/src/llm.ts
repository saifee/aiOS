import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@leadhunter/db";
import { PLANS, PlanKey, decrypt, assertPublicUrl, allowPrivateAiUrls } from "@leadhunter/integrations";

/**
 * aiOS model layer — every LLM call in the system goes through here.
 *
 *  • Bring-your-own-keys: each user stores keys for any provider (encrypted at rest).
 *  • Failover chain: keys are tried in the user's priority order; if one is rate-limited,
 *    out of credit or down, the next one answers. (Stack free tiers: Groq → Gemini → OpenRouter…)
 *  • Free plan = BYOK only: the platform's own keys are never used for FREE workspaces.
 *  • Paid plans use the user's keys first, then fall back to the platform's keys.
 */

/** A model id is one token such as "gpt-4o-mini" or "meta-llama/llama-3.3-70b". Anything with spaces or commas (pasted from a dropdown) is not usable. */
export const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:\/@-]{0,118}$/;
const GEMINI_ALIASES: Record<string, string> = { "gemini-flash": "gemini-flash-latest", "flash": "gemini-flash-latest", "gemini-pro": "gemini-pro-latest", "pro": "gemini-pro-latest" };
/** Returns a model the provider will accept, or undefined so the caller falls back to the provider's default. */
export function usableModel(kind: string, model?: string | null): string | undefined {
  let m = (model ?? "").trim();
  if (kind === "gemini") m = m.replace(/^models\//, "");
  if (!m || !MODEL_RE.test(m)) return undefined;
  return kind === "gemini" ? (GEMINI_ALIASES[m.toLowerCase()] ?? m) : m;
}

export type Kind = "anthropic" | "openai" | "gemini";
export type ProviderSpec = { label: string; kind: Kind; base?: string; model: string; tools: boolean; free?: boolean; json?: boolean; keyUrl: string; note?: string };

export const PROVIDERS: Record<string, ProviderSpec> = {
  groq:       { label: "Groq",              kind: "openai",    base: "https://api.groq.com/openai/v1",   model: "llama-3.3-70b-versatile",                   tools: true,  free: true,  json: true,  keyUrl: "https://console.groq.com/keys", note: "Very fast, generous free tier" },
  gemini:     { label: "Google Gemini",     kind: "gemini",                                                model: "gemini-flash-latest",                          tools: false, free: true,  json: true,  keyUrl: "https://aistudio.google.com/apikey", note: "Free tier in Google AI Studio" },
  openrouter: { label: "OpenRouter",        kind: "openai",    base: "https://openrouter.ai/api/v1",     model: "meta-llama/llama-3.3-70b-instruct:free",    tools: true,  free: true,  keyUrl: "https://openrouter.ai/keys", note: "One key, hundreds of models incl. free ones" },
  cerebras:   { label: "Cerebras",          kind: "openai",    base: "https://api.cerebras.ai/v1",       model: "llama3.3-70b",                              tools: true,  free: true,  keyUrl: "https://cloud.cerebras.ai", note: "Free tier, very high speed" },
  mistral:    { label: "Mistral",           kind: "openai",    base: "https://api.mistral.ai/v1",        model: "mistral-small-latest",                      tools: true,  free: true,  json: true,  keyUrl: "https://console.mistral.ai/api-keys" },
  anthropic:  { label: "Anthropic Claude",  kind: "anthropic",                                             model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5", tools: true, keyUrl: "https://console.anthropic.com/settings/keys", note: "Best for agents and tool use" },
  openai:     { label: "OpenAI",            kind: "openai",    base: "https://api.openai.com/v1",        model: "gpt-4o-mini",                               tools: true,  json: true,  keyUrl: "https://platform.openai.com/api-keys" },
  deepseek:   { label: "DeepSeek",          kind: "openai",    base: "https://api.deepseek.com/v1",      model: "deepseek-chat",                             tools: true,  json: true,  keyUrl: "https://platform.deepseek.com/api_keys", note: "Very low cost" },
  together:   { label: "Together AI",       kind: "openai",    base: "https://api.together.xyz/v1",      model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",   tools: true,  keyUrl: "https://api.together.ai/settings/api-keys" },
  xai:        { label: "xAI Grok",          kind: "openai",    base: "https://api.x.ai/v1",              model: "grok-3-mini",                               tools: true,  keyUrl: "https://console.x.ai" },
  perplexity: { label: "Perplexity",        kind: "openai",    base: "https://api.perplexity.ai",        model: "sonar",                                     tools: false, keyUrl: "https://www.perplexity.ai/settings/api", note: "Web-grounded answers" },
  custom:     { label: "Custom (OpenAI-compatible)", kind: "openai",                                       model: "",                                          tools: true,  keyUrl: "", note: "Ollama, LM Studio, vLLM, Azure… any OpenAI-style endpoint" },
};

// ── Per-request context (who is asking → whose keys + which plan) ─────────────
export type LlmCtx = { tenantId?: string; userId?: string };
const als = new AsyncLocalStorage<LlmCtx>();
export const withLlmContext = <T>(ctx: LlmCtx, fn: () => Promise<T>): Promise<T> => als.run(ctx, fn);

/** Resolve a workspace from a business id, then run fn inside its AI context. */
export async function withBusinessContext<T>(businessId: string | undefined, fn: () => Promise<T>, userId?: string): Promise<T> {
  if (!businessId) return fn();
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { tenantId: true } }).catch(() => null);
  return b ? als.run({ tenantId: b.tenantId, userId }, fn) : fn();
}

export class NoAiKeyError extends Error {
  statusCode = 402;
  constructor(m: string) { super(m); this.name = "NoAiKeyError"; }
}

// ── Key resolution ────────────────────────────────────────────────────────────
type Entry = { id?: string; provider: string; spec: ProviderSpec; key: string; model: string; base?: string; source: "user" | "team" | "platform" };

const planCache = new Map<string, { at: number; plan: PlanKey }>();
async function planOf(tenantId: string): Promise<PlanKey> {
  const hit = planCache.get(tenantId);
  if (hit && Date.now() - hit.at < 60_000) return hit.plan;
  const [sub, t] = await Promise.all([prisma.subscription.findUnique({ where: { tenantId } }), prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } })]);
  const plan = ((sub?.plan ?? t?.plan) ?? "FREE") as PlanKey;
  planCache.set(tenantId, { at: Date.now(), plan });
  return plan;
}
export const isByokOnly = async (tenantId?: string) => !!tenantId && !!PLANS[await planOf(tenantId)]?.byokOnly;
export const invalidatePlan = (tenantId: string) => planCache.delete(tenantId);

const keyCache = new Map<string, { at: number; rows: any[] }>();
export const invalidateKeys = (tenantId: string) => keyCache.delete(tenantId);

const PLATFORM: [string, string | undefined][] = [
  ["anthropic", process.env.ANTHROPIC_API_KEY], ["openai", process.env.OPENAI_API_KEY],
  ["gemini", process.env.GEMINI_API_KEY], ["perplexity", process.env.PERPLEXITY_API_KEY], ["groq", process.env.GROQ_API_KEY],
];
const PLATFORM_MODEL: Record<string, string | undefined> = { anthropic: process.env.CLAUDE_MODEL, openai: process.env.OPENAI_MODEL, gemini: process.env.GEMINI_MODEL, perplexity: process.env.PERPLEXITY_MODEL };

async function resolveChain(prefer?: string): Promise<Entry[]> {
  const ctx = als.getStore();
  const out: Entry[] = [];
  if (ctx?.tenantId) {
    let c = keyCache.get(ctx.tenantId);
    if (!c || Date.now() - c.at > 20_000) {
      c = { at: Date.now(), rows: await prisma.aiKey.findMany({ where: { tenantId: ctx.tenantId, enabled: true }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] }) };
      keyCache.set(ctx.tenantId, c);
    }
    const mine = c.rows.filter((r) => ctx.userId && r.userId === ctx.userId);
    const team = c.rows.filter((r) => r.userId !== ctx.userId && r.shared);
    for (const [rows, source] of [[mine, "user"], [team, "team"]] as const)
      for (const r of rows) {
        const spec = PROVIDERS[r.provider]; if (!spec) continue;
        try { out.push({ id: r.id, provider: r.provider, spec, key: decrypt(r.keyEnc), model: usableModel(spec.kind, r.model) || spec.model, base: r.baseUrl || spec.base, source }); } catch { /* unreadable (ENCRYPTION_KEY changed) — skip */ }
      }
  }
  const byok = await isByokOnly(ctx?.tenantId);
  if (!byok) for (const [p, k] of PLATFORM) if (k && PROVIDERS[p]) out.push({ provider: p, spec: PROVIDERS[p], key: k, model: PLATFORM_MODEL[p] || PROVIDERS[p].model, base: PROVIDERS[p].base, source: "platform" });
  if (!out.length)
    throw new NoAiKeyError(byok
      ? "Your Free plan runs on your own AI keys. Add one in Settings → AI Keys (Groq, Google Gemini and OpenRouter all have free tiers)."
      : "No AI key available. Add one in Settings → AI Keys, or set ANTHROPIC_API_KEY on the server.");
  if (prefer) { const i = out.findIndex((e) => e.provider === prefer); if (i > 0) out.unshift(...out.splice(i, 1)); }
  return out;
}

// ── Neutral conversation format (converted per provider) ──────────────────────
export type ToolSpec = { name: string; description: string; input_schema: any };
export type Turn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; calls?: { id: string; name: string; input: any }[] }
  | { role: "tool"; results: { id: string; name: string; content: string }[] };
export type ChatResult = { text: string; calls: { id: string; name: string; input: any }[]; tokensIn: number; tokensOut: number; provider: string; model: string };

const flatten = (turns: Turn[]) => turns.map((t) => t.role === "user" ? t.text : t.role === "assistant" ? `[assistant] ${t.text}` : `[tool results] ${t.results.map((r) => `${r.name}: ${r.content}`).join("\n")}`).join("\n\n");

const safeHost = (u: string) => { try { return new URL(u).hostname; } catch { return ""; } };

async function post(url: string, headers: Record<string, string>, body: unknown) {
  // SSRF guard: user-supplied base URLs must resolve to public hosts (unless self-hosting opted in).
  // Built-in provider hosts are trusted; anything else (custom / overridden base URLs) must resolve publicly.
  const host = new URL(url).hostname;
  const builtin = host === "api.anthropic.com" || Object.entries(PROVIDERS).some(([id, p]) => id !== "custom" && p.base && safeHost(p.base) === host);
  if (!builtin) await assertPublicUrl(url, { allowPrivate: allowPrivateAiUrls() });
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000), redirect: "error" });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200)}`);
  return r.json() as Promise<any>;
}

async function callEntry(e: Entry, o: { system?: string; turns: Turn[]; tools?: ToolSpec[]; maxTokens: number; json?: boolean }): Promise<ChatResult> {
  const base = { provider: e.provider, model: e.model };
  if (e.spec.kind === "anthropic") {
    const messages = o.turns.map((t) => t.role === "user" ? { role: "user", content: t.text }
      : t.role === "assistant" ? { role: "assistant", content: [...(t.text ? [{ type: "text", text: t.text }] : []), ...(t.calls ?? []).map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.input }))] }
      : { role: "user", content: t.results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.content })) });
    const j = await post("https://api.anthropic.com/v1/messages", { "x-api-key": e.key, "anthropic-version": "2023-06-01" },
      { model: e.model, max_tokens: o.maxTokens, system: o.system, messages, ...(o.tools?.length && { tools: o.tools }) });
    const blocks: any[] = j.content ?? [];
    return { ...base, text: blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n"),
      calls: blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: b.input })),
      tokensIn: j.usage?.input_tokens ?? 0, tokensOut: j.usage?.output_tokens ?? 0 };
  }
  if (e.spec.kind === "gemini") {
    const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${e.model}:generateContent`, { "x-goog-api-key": e.key }, {
      system_instruction: o.system ? { parts: [{ text: o.system }] } : undefined,
      contents: [{ role: "user", parts: [{ text: flatten(o.turns) }] }],
      generationConfig: { maxOutputTokens: o.maxTokens, ...(o.json && { responseMimeType: "application/json" }) },
    });
    return { ...base, text: j.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "", calls: [], tokensIn: j.usageMetadata?.promptTokenCount ?? 0, tokensOut: j.usageMetadata?.candidatesTokenCount ?? 0 };
  }
  // OpenAI-compatible (OpenAI, Groq, OpenRouter, Mistral, DeepSeek, Together, xAI, Cerebras, Perplexity, custom…)
  const base_ = (e.base ?? "").replace(/\/+$/, "");
  if (!base_) throw new Error("no base URL configured");
  const msgs: any[] = [...(o.system ? [{ role: "system", content: o.system }] : [])];
  for (const t of o.turns) {
    if (t.role === "user") msgs.push({ role: "user", content: t.text });
    else if (t.role === "assistant") msgs.push({ role: "assistant", content: t.text || null, ...(t.calls?.length && { tool_calls: t.calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) } })) }) });
    else for (const r of t.results) msgs.push({ role: "tool", tool_call_id: r.id, content: r.content });
  }
  const j = await post(`${base_}/chat/completions`, { Authorization: `Bearer ${e.key}` }, {
    model: e.model, messages: msgs, [e.provider === "openai" ? "max_completion_tokens" : "max_tokens"]: o.maxTokens,
    ...(o.tools?.length && { tools: o.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })) }),
    ...(o.json && e.spec.json && { response_format: { type: "json_object" } }),
  });
  const m = j.choices?.[0]?.message ?? {};
  const calls = (m.tool_calls ?? []).map((c: any) => { let input = {}; try { input = JSON.parse(c.function?.arguments || "{}"); } catch { /* keep {} */ } return { id: c.id, name: c.function?.name, input }; });
  return { ...base, text: typeof m.content === "string" ? m.content : "", calls, tokensIn: j.usage?.prompt_tokens ?? 0, tokensOut: j.usage?.completion_tokens ?? 0 };
}

const redact = (m: string, chain: Entry[]) => chain.reduce((acc, e) => (e.key ? acc.split(e.key).join("***") : acc), m);

function touch(e: Entry, error?: string) {
  if (!e.id) return;
  prisma.aiKey.update({ where: { id: e.id }, data: error ? { lastError: error.slice(0, 300) } : { lastOkAt: new Date(), lastError: null } }).catch(() => {});
}

/** One chat step with automatic failover across the caller's key chain. */
export async function chat(o: { system?: string; turns: Turn[]; tools?: ToolSpec[]; maxTokens?: number; json?: boolean; prefer?: string }): Promise<ChatResult> {
  const chain = await resolveChain(o.prefer);
  let list = chain, tools = o.tools;
  if (tools?.length) {
    const capable = chain.filter((e) => e.spec.tools);
    if (capable.length) list = capable; else tools = undefined; // only tool-less providers available → answer without tools
  }
  const errors: string[] = [];
  for (const e of list) {
    try {
      const r = await callEntry(e, { system: o.system, turns: o.turns, tools, maxTokens: o.maxTokens ?? 1500, json: o.json });
      touch(e);
      return r;
    } catch (err: any) {
      const msg = `${e.spec.label}: ${redact(String(err?.message ?? err), chain)}`;
      errors.push(msg); touch(e, msg);
    }
  }
  throw Object.assign(new Error(`All AI providers failed — ${errors.join(" | ")}`), { statusCode: 502 });
}

/** Single-prompt completion (most agents/generators use this). */
export async function complete(o: { system?: string; prompt: string; maxTokens?: number; json?: boolean; prefer?: string }): Promise<string> {
  return (await chat({ system: o.system, turns: [{ role: "user", text: o.prompt }], maxTokens: o.maxTokens, json: o.json, prefer: o.prefer })).text;
}

/** Validate a key with a tiny request (used by Settings → AI Keys). Never throws. */
export async function testKey(provider: string, key: string, model?: string, baseUrl?: string): Promise<{ ok: boolean; ms: number; error?: string }> {
  const spec = PROVIDERS[provider];
  if (!spec) return { ok: false, ms: 0, error: "Unknown provider" };
  const t0 = Date.now();
  try {
    const e: Entry = { provider, spec, key, model: usableModel(spec.kind, model) || spec.model, base: baseUrl || spec.base, source: "user" };
    await callEntry(e, { turns: [{ role: "user", text: "Reply with the single word: OK" }], maxTokens: 16 });
    return { ok: true, ms: Date.now() - t0 };
  } catch (err: any) {
    return { ok: false, ms: Date.now() - t0, error: String(err?.message ?? err).replace(key, "***").slice(0, 240) };
  }
}
