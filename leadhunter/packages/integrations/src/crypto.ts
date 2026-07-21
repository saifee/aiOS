import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || "0".repeat(64), "hex");

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${enc.toString("hex")}`;
}
export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split(".");
  const d = createDecipheriv("aes-256-gcm", KEY, Buffer.from(iv, "hex"));
  d.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([d.update(Buffer.from(data, "hex")), d.final()]).toString("utf8");
}
