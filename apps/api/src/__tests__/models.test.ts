import { describe, it, expect, vi } from "vitest";
vi.mock("@leadhunter/db", async () => { const { db: d } = await import("./dbmock"); return { prisma: d, arr: (v: any) => v ?? [], findLeadByListValue: vi.fn() }; });
import { usableModel, MODEL_RE, explainAiError, geminiContents, geminiSchema, PROVIDERS } from "@leadhunter/agents";

describe("model names", () => {
  it("accepts real model ids", () => {
    for (const m of ["gpt-4o-mini", "gemini-flash-latest", "meta-llama/llama-3.3-70b-instruct:free", "claude-sonnet-4-5"]) expect(usableModel("openai", m)).toBe(m);
  });
  it("rejects text pasted from a dropdown so the provider default is used", () => {
    expect(usableModel("openai", "auto, default, GPT-6 Luna, GPT-6,")).toBeUndefined();
    expect(usableModel("gemini", "gemini-flash, default")).toBeUndefined();
    expect(usableModel("openai", "   ")).toBeUndefined(); expect(usableModel("openai", null)).toBeUndefined();
  });
  it("repairs Gemini shorthand and the models/ prefix", () => {
    expect(usableModel("gemini", "gemini-flash")).toBe("gemini-flash-latest");
    expect(usableModel("gemini", "models/gemini-2.5-pro")).toBe("gemini-2.5-pro");
  });
  it("MODEL_RE blocks spaces, commas and path tricks", () => { expect(MODEL_RE.test("a b")).toBe(false); expect(MODEL_RE.test("a,b")).toBe(false); expect(MODEL_RE.test("../x")).toBe(false); });
});

describe("friendly AI errors", () => {
  it("explains an out-of-credit OpenAI key and points to free providers", () => {
    const r = explainAiError("openai", 'HTTP 429 { "error": { "message": "You have no credits remaining. Add credits", "type": "insufficient_quota" } }');
    expect(r.kind).toBe("quota"); expect(r.hint).toMatch(/no credit/i); expect(r.hint).toMatch(/free/i);
  });
  it("tells apart a rejected key, a bad model, a rate limit and a network error", () => {
    expect(explainAiError("gemini", "HTTP 400 API key not valid").kind).toBe("auth");
    expect(explainAiError("openai", "HTTP 401 Incorrect API key provided").kind).toBe("auth");
    expect(explainAiError("gemini", "HTTP 404 models/gemini-2.0-flash is no longer available").kind).toBe("model");
    expect(explainAiError("groq", "HTTP 429 rate limit reached").kind).toBe("rate");
    expect(explainAiError("groq", "fetch failed").kind).toBe("network");
  });
});

describe("Gemini tool calling format", () => {
  it("maps neutral turns to functionCall / functionResponse parts and keeps thought signatures", () => {
    const c = geminiContents([
      { role: "user", text: "find acme" },
      { role: "assistant", text: "", calls: [{ id: "1", name: "search_crm", input: { q: "acme" }, sig: "SIG" }] },
      { role: "tool", results: [{ id: "1", name: "search_crm", content: "{\"n\":1}" }] },
    ]);
    expect(c[1]).toEqual({ role: "model", parts: [{ functionCall: { name: "search_crm", args: { q: "acme" } }, thoughtSignature: "SIG" }] });
    expect(c[2].parts[0].functionResponse.name).toBe("search_crm");
  });
  it("strips JSON-schema keys Gemini rejects", () => {
    const s = geminiSchema({ type: "object", additionalProperties: false, $schema: "x", properties: { q: { type: "string", default: "a" } } });
    expect(s).toEqual({ type: "object", properties: { q: { type: "string" } } });
  });
  it("has free providers ready to use", () => {
    for (const p of ["groq", "gemini", "openrouter", "cerebras", "mistral", "nvidia", "sambanova", "github"]) expect(PROVIDERS[p]?.free).toBe(true);
    expect(PROVIDERS.gemini.tools).toBe(true);
  });
});
