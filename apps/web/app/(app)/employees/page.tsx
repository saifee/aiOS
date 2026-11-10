"use client";
import { useEffect } from "react";

// AI Employees now lives inside AI Workforce. This keeps old links working.
export default function EmployeesRedirect() {
  useEffect(() => { window.location.replace("/workforce#routines"); }, []);
  return <p className="p-6 text-sm text-ink/60">Moved to AI Workforce → Scheduled routines…</p>;
}
