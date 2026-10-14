"use client";
import { useEffect } from "react";
export default function Redirect() {
  useEffect(() => { window.location.replace("/playbooks"); }, []);
  return <p className="text-sm text-ink/50">Moving to the new home for this page…</p>;
}
