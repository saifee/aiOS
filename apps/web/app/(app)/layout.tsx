"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { fetcher, businessId } from "@/lib/api";
import { useEffect } from "react";

const nav = [
  { href: "/command", label: "Command Center" },
  { href: "/workforce", label: "AI Workforce" },
  { href: "/receptionist", label: "Receptionist" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/conversations", label: "Conversations" },
  { href: "/bi", label: "Intelligence" },
  { href: "/sops", label: "SOP Engine" },
  { href: "/billing", label: "Billing" },
  { href: "/settings", label: "Settings" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data: businesses } = useSWR("/businesses", fetcher);

  useEffect(() => {
    if (businesses?.length && !businessId()) localStorage.setItem("lh_business", businesses[0].id);
  }, [businesses]);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col bg-ink text-white">
        <div className="border-b border-white/10 p-5">
          <div className="font-display text-lg font-semibold">Kingslee<span className="text-signal"> AIOS</span></div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-white/50">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-signal" /> Agency running 24/7
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((n) => (
            <Link key={n.href} href={n.href}
              className={`block rounded-lg px-3 py-2 text-sm ${path.startsWith(n.href) ? "bg-white/10 font-medium" : "text-white/60 hover:bg-white/5"}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        {businesses?.length > 0 && (
          <div className="border-t border-white/10 p-3">
            <select className="w-full rounded-lg bg-white/10 p-2 text-xs" defaultValue={businessId() ?? ""}
              onChange={(e) => { localStorage.setItem("lh_business", e.target.value); window.location.reload(); }}>
              {businesses.map((b: any) => <option key={b.id} value={b.id} className="text-ink">{b.name}</option>)}
            </select>
          </div>
        )}
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
