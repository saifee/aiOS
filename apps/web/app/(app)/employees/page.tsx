"use client";
import { useEffect } from "react";

// AI Employees now lives inside AI Workforce → Agents. This keeps old links working.
export default function EmployeesRedirect() {
  useEffect(() => { window.location.replace("/workforce#agents"); }, []);
  return <p className="p-6 text-sm text-ink/60">Moved to AI Workforce → Agents…</p>;
}
