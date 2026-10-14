import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/** True only for a real 64-hex-char key that is not all zeros. */
export function encryptionConfigured(): boolean {
  const k = process.env.ENCRYPTION_KEY ?? "";
  return /^[0-9a-f]{64}$/i.test(k) && !/^0+$/.test(k);
}
function key(): Buffer {
  // No silent all-zero fallback: refuse to encrypt/decrypt without a real key.
  if (!encryptionConfigured()) throw new Error("ENCRYPTION_KEY is missing or invalid (need 64 hex characters, not all zeros).");
  return Buffer.from(process.env.ENCRYPTION_KEY!, "hex");
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${enc.toString("hex")}`;
}
export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split(".");
  if (!iv || !tag || data === undefined) throw new Error("Malformed ciphertext");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "hex"));
  d.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([d.update(Buffer.from(data, "hex")), d.final()]).toString("utf8");
}
