import { scrypt, randomBytes, timingSafeEqual, ScryptOptions } from "crypto";

/** Password hashing with Node's built-in scrypt (no native module to compile). Format: scrypt$N$r$p$salt$hash (base64). */
const N = 16384, R = 8, P = 1, KEYLEN = 64;
const derive = (pw: string, salt: Buffer, n: number, r: number, p: number) =>
  new Promise<Buffer>((res, rej) => scrypt(pw, salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 } as ScryptOptions, (e, k) => (e ? rej(e) : res(k))));

export async function hash(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${(await derive(password, salt, N, R, P)).toString("base64")}`;
}

export async function verify(stored: string, password: string): Promise<boolean> {
  const [alg, n, r, p, salt, key] = stored.split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const got = await derive(password, Buffer.from(salt, "base64"), +n, +r, +p);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export default { hash, verify };
