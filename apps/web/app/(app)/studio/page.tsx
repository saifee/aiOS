"use client";
import { useEffect } from "react";
export default function Redirect() {
  useEffect(() => { window.location.replace("/workforce#studio"); }, []);
  return <p className="text-sm text-ink/50">Moving to the new home for this page…</p>;
}
