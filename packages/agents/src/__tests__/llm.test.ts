import { describe, it, expect, beforeAll, vi } from "vitest";

beforeAll(() => { process.env.GROQ_API_KEY = "gsk_test_groq"; process.env.OPENAI_API_KEY = "sk-test-openai"; delete process.env.ANTHROPIC_API_KEY; });

const ok = (text: string, calls: any[] = []) => new Response(JSON.stringify({ choices: [{ message: { content: text, tool_calls: calls } }], usage: { prompt_tokens: 3, completion_tokens: 4 } }), { status: 200 });

describe("aiOS model layer", () => {
  it("fails over to the next provider when the first is rate-limited", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(u); return urls.length === 1 ? new Response("rate limited", { status: 429 }) : ok("hello from openai"); }));
    const { complete } = await import("../llm");
    const text = await complete({ prompt: "hi" });
    expect(text).toBe("hello from openai");
    expect(urls[0]).toContain("openai.com"); // platform order: paid providers first
    expect(urls[1]).toContain("groq.com");
  });

  it("converts tool calls to the neutral format and never leaks the key in errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok("", [{ id: "c1", type: "function", function: { name: "search_crm", arguments: "{\"query\":\"acme\"}" } }])));
    const { chat } = await import("../llm");
    const r = await chat({ turns: [{ role: "user", text: "find acme" }], tools: [{ name: "search_crm", description: "d", input_schema: { type: "object" } }] });
    expect(r.calls).toEqual([{ id: "c1", name: "search_crm", input: { query: "acme" } }]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad key gsk_test_groq", { status: 401 })));
    await expect(chat({ turns: [{ role: "user", text: "x" }] })).rejects.toThrow(/All AI providers failed/);
    await expect(chat({ turns: [{ role: "user", text: "x" }] })).rejects.not.toThrow(/gsk_test_groq/);
  });

  it("testKey reports success and failure without throwing", async () => {
    const { testKey } = await import("../llm");
    vi.stubGlobal("fetch", vi.fn(async () => ok("OK")));
    expect((await testKey("groq", "gsk_abcdefghij")).ok).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const bad = await testKey("groq", "gsk_abcdefghij");
    expect(bad.ok).toBe(false); expect(bad.error).toContain("401");
  });
});
