const API = process.env.NEXT_PUBLIC_API_URL ?? "";  // same-origin in single-process deploy

const T = "aios_token", B = "aios_business";
function get(k: string, legacy: string) {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(k) ?? localStorage.getItem(legacy); } catch { return null; }
}
export function token() { return get(T, "lh_token"); }
export function setToken(t: string) { try { localStorage.setItem(T, t); } catch { /* private mode */ } }
export function clearSession() { try { localStorage.removeItem(T); localStorage.removeItem("lh_token"); localStorage.removeItem(B); localStorage.removeItem("lh_business"); } catch { /* ignore */ } }
export function businessId() { return get(B, "lh_business"); }
export function setBusinessId(id: string) { try { localStorage.setItem(B, id); } catch { /* ignore */ } }

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}/v1${path}`, {
    ...init,
    // Only declare a JSON body when there is one; otherwise the server rejects the request ("Body cannot be empty").
    headers: { ...(init.body != null && { "Content-Type": "application/json" }), ...(token() && { Authorization: `Bearer ${token()}` }), ...init.headers },
  });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth")) {
    // An expired/invalid token must be dropped, and we must never reload the login page itself (that was an endless refresh loop).
    clearSession();
    if (!["/login", "/setup", "/", "/join", "/book"].includes(window.location.pathname.replace(/\/+$/, "") || "/")) window.location.href = "/login";
  }
  if (!res.ok) { const j: any = await res.json().catch(() => ({})); throw new Error(j?.error ?? j?.message ?? `API ${res.status}`); }
  return res.json();
}

export const fetcher = (path: string) => api(path);
