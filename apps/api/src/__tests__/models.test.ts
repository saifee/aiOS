import { describe, it, expect } from "vitest";
import { usableModel, MODEL_RE } from "@leadhunter/agents";

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
