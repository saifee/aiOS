"use client";
import { useState } from "react";
import { api } from "@/lib/api";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ email: "", password: "", name: "", tenantName: "" });
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    try {
      const res = await api(`/auth/${mode}`, { method: "POST", body: JSON.stringify(form) });
      localStorage.setItem("lh_token", res.token);
      window.location.href = "/dashboard";
    } catch (e: any) { setError(e.message); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-semibold">LeadHunter AI</h1>
        <p className="mb-6 mt-1 text-sm text-ink/60">Your sales team that never sleeps.</p>
        {mode === "register" && (<>
          <input className="input mb-3" placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input mb-3" placeholder="Company name" value={form.tenantName} onChange={(e) => setForm({ ...form, tenantName: e.target.value })} />
        </>)}
        <input className="input mb-3" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input mb-4" placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <button className="btn w-full justify-center" onClick={submit}>{mode === "login" ? "Sign in" : "Create account"}</button>
        <button className="mt-3 w-full text-center text-sm text-signal" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
