const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function token() { return typeof window !== "undefined" ? localStorage.getItem("lh_token") : null; }

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token() && { Authorization: `Bearer ${token()}` }), ...init.headers },
  });
  if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `API ${res.status}`);
  return res.json();
}

export const fetcher = (path: string) => api(path);
export function businessId() { return typeof window !== "undefined" ? localStorage.getItem("lh_business") : null; }
