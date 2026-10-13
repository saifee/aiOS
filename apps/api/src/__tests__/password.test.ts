import { describe, it, expect } from "vitest";
import pw from "../lib/password";
describe("password hashing (scrypt)", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const h = await pw.hash("correct horse");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await pw.verify(h, "correct horse")).toBe(true);
    expect(await pw.verify(h, "wrong")).toBe(false);
  });
  it("uses a fresh salt each time", async () => {
    expect(await pw.hash("x")).not.toBe(await pw.hash("x"));
  });
  it("rejects malformed hashes without throwing", async () => {
    expect(await pw.verify("not-a-hash", "x")).toBe(false);
  });
});
