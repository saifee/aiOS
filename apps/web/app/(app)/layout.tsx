"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { useEffect, useState } from "react";
import { KeyRound, LogOut, Menu, X } from "lucide-react";
import { fetcher, businessId, setBusinessId, token, clearSession } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { NAV } from "@/lib/nav";
import { LogoMark, Wordmark } from "@/components/Logo";
import { SearchBox } from "@/components/SearchBox";

type T = { id: number; message: string; kind: string };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [nav, setNav] = useState(false);
  const [menu, setMenu] = useState(false);
  const [toasts, setToasts] = useState<T[]>([]);
  const { data: me } = useMe();
  const { data: businesses } = useSWR("/businesses", fetcher);

  useEffect(() => { if (!token()) router.replace("/login"); }, [router]);
  useEffect(() => { if (businesses?.length && !businessId()) setBusinessId(businesses[0].id); }, [businesses]);
  useEffect(() => setNav(false), [path]);
  useEffect(() => {
    const on = (e: Event) => {
      const { message, kind } = (e as CustomEvent).detail; const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, kind }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
    };
    window.addEventListener("aios:toast", on); return () => window.removeEventListener("aios:toast", on);
  }, []);

  const initials = (me?.user.name || me?.user.email || "?").split(/[\s@]/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  const free = me?.byokOnly;

  const sidebar = (
    <div className="flex h-full flex-col bg-ink text-white">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-5 py-5"><LogoMark /><Wordmark light /></Link>
      <nav className="flex-1 space-y-1 px-3" aria-label="Main">
        {NAV.map((n) => {
          const on = path.startsWith(n.href); const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${on ? "bg-white/12 text-white shadow-inner" : "text-white/65 hover:bg-white/8 hover:text-white"}`}>
              <Icon className={`h-[18px] w-[18px] ${on ? "text-[#8FA6FF]" : ""}`} />{n.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-3 p-3">
        {free && !me?.aiKeys && (
          <Link href="/settings#keys" className="block rounded-xl bg-gradient-to-br from-signal to-[#8B5CF6] p-3 text-xs leading-snug">
            <span className="mb-1 flex items-center gap-1.5 text-sm font-bold"><KeyRound className="h-4 w-4" />Power up your team</span>
            Add a free AI key to start running agents.
          </Link>
        )}
        {businesses?.length > 0 && (
          <select aria-label="Business" className="w-full rounded-lg bg-white/10 p-2 text-xs" defaultValue={businessId() ?? ""}
            onChange={(e) => { setBusinessId(e.target.value); window.location.reload(); }}>
            {businesses.map((b: any) => <option key={b.id} value={b.id} className="text-ink">{b.name}</option>)}
          </select>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">{sidebar}</aside>
      {nav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setNav(false)} />
          <div className="absolute inset-y-0 left-0 w-64">{sidebar}</div>
          <button aria-label="Close menu" className="absolute right-3 top-3 text-white" onClick={() => setNav(false)}><X /></button>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur sm:px-8">
          <button aria-label="Open menu" className="lg:hidden" onClick={() => setNav(true)}><Menu /></button>
          <div className="flex flex-1 justify-center lg:justify-start"><SearchBox /></div>
          {me && <Link href="/settings#plan" className="hidden rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold sm:block">{me.planName} plan</Link>}
          <div className="relative">
            <button aria-label="Account menu" onClick={() => setMenu(!menu)} className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-signal to-[#8B5CF6] text-xs font-bold text-white">{initials}</button>
            {menu && (
              <div className="absolute right-0 top-11 z-50 w-64 rounded-2xl border border-line bg-white p-3 shadow-lift">
                <div className="px-2 pb-2 text-sm"><div className="font-semibold">{me?.user.name}</div><div className="truncate text-xs text-ink/55">{me?.user.email}</div><div className="mt-1 text-xs text-ink/55">{me?.tenant.name}</div></div>
                <Link href="/settings#keys" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-paper" onClick={() => setMenu(false)}><KeyRound className="h-4 w-4" />AI keys</Link>
                <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-paper" onClick={() => { clearSession(); router.replace("/login"); }}><LogOut className="h-4 w-4" />Sign out</button>
              </div>
            )}
          </div>
        </header>
        <main className="p-4 sm:p-8">{children}</main>
      </div>
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] space-y-2" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`pointer-events-auto max-w-sm rounded-xl px-4 py-3 text-sm text-white shadow-lift ${t.kind === "error" ? "bg-danger" : "bg-ink"}`}>{t.message}</div>)}
      </div>
    </div>
  );
}
