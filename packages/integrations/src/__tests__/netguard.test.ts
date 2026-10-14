import { describe, it, expect } from "vitest";
import { assertPublicUrl, isPrivateIp, UnsafeUrlError } from "../netguard";
import { encrypt, decrypt } from "../crypto";

describe("SSRF guard", () => {
  it.each(["http://127.0.0.1/x", "http://localhost:11434/v1", "http://169.254.169.254/latest/meta-data", "http://10.0.0.5", "http://192.168.1.1", "http://172.16.0.1", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://[fd00::1]/", "http://0.0.0.0", "http://metadata.internal/"])("blocks %s", async (u) => {
    await expect(assertPublicUrl(u)).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it.each(["file:///etc/passwd", "ftp://example.com", "gopher://x", "javascript:alert(1)", "http://user:pw@example.com", "not a url"])("rejects %s", async (u) => {
    await expect(assertPublicUrl(u)).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it("allows public IP literals and honours the explicit self-host opt-in", async () => {
    await expect(assertPublicUrl("https://8.8.8.8/v1")).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl("http://localhost:11434/v1", { allowPrivate: true })).resolves.toBeInstanceOf(URL);
  });
  it("classifies private ranges", () => { expect(isPrivateIp("100.64.0.1")).toBe(true); expect(isPrivateIp("8.8.8.8")).toBe(false); expect(isPrivateIp("172.32.0.1")).toBe(false); });
});

describe("encryption", () => {
  it("round-trips with a real key and refuses to work without one (no zero-key fallback)", () => {
    process.env.ENCRYPTION_KEY = "cd".repeat(32);
    expect(decrypt(encrypt("secret-value"))).toBe("secret-value");
    expect(encrypt("a")).not.toBe(encrypt("a"));
    for (const bad of [undefined, "", "0".repeat(64), "abc"]) {
      if (bad === undefined) delete process.env.ENCRYPTION_KEY; else process.env.ENCRYPTION_KEY = bad;
      expect(() => encrypt("x")).toThrow(/ENCRYPTION_KEY/);
    }
  });
  it("detects tampered ciphertext", () => {
    process.env.ENCRYPTION_KEY = "cd".repeat(32);
    const [iv, tag, data] = encrypt("hello").split(".");
    expect(() => decrypt([iv, tag, "00" + data.slice(2)].join("."))).toThrow();
  });
});
