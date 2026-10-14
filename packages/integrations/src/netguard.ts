import { lookup } from "dns/promises";
import { isIP } from "net";

/**
 * SSRF guard for any outbound request whose URL is user-influenced
 * (custom AI base URLs, lead websites, ...). Blocks non-http(s), embedded
 * credentials, and hosts that resolve to loopback / private / link-local /
 * metadata / multicast ranges. Redirects are followed manually and re-checked.
 *
 * Known limit: DNS can change between check and connect (rebinding). Mitigate at
 * the network layer (egress firewall) where the host allows it. See docs/security.
 */
export class UnsafeUrlError extends Error { constructor(msg: string) { super(msg); this.name = "UnsafeUrlError"; } }

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    // WHATWG URL normalises ::ffff:127.0.0.1 to the hex form ::ffff:7f00:1
    const hex = x.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) { const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16); return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`); }
    return x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb") || x.startsWith("ff");
  }
  return true; // not an IP → treat as unsafe
}

export async function assertPublicUrl(raw: string, opts: { allowPrivate?: boolean } = {}): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new UnsafeUrlError("Invalid URL"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new UnsafeUrlError("Only http(s) URLs are allowed");
  if (u.username || u.password) throw new UnsafeUrlError("URLs with credentials are not allowed");
  if (opts.allowPrivate) return u;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) throw new UnsafeUrlError("Private hosts are not allowed");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new UnsafeUrlError("Host could not be resolved"); });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new UnsafeUrlError("Host resolves to a private or reserved address");
  return u;
}

/** Whether private/self-hosted AI endpoints (e.g. Ollama on localhost) are allowed. Off by default. */
export const allowPrivateAiUrls = () => process.env.ALLOW_PRIVATE_AI_URLS === "true";

export async function safeFetch(raw: string, init: RequestInit & { allowPrivate?: boolean; maxRedirects?: number } = {}): Promise<Response> {
  const { allowPrivate, maxRedirects = 3, ...rest } = init;
  let url = raw;
  for (let i = 0; i <= maxRedirects; i++) {
    const u = await assertPublicUrl(url, { allowPrivate });
    const res = await fetch(u, { ...rest, redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { url = new URL(res.headers.get("location")!, u).toString(); continue; }
    return res;
  }
  throw new UnsafeUrlError("Too many redirects");
}
