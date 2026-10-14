"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, Globe2, KeyRound, LayoutGrid, Lock, MoonStar, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/Logo";
import { Demo } from "@/components/landing/Demo";
import { AGENT_META, FEATURED, metaFor } from "@/lib/agents";
import { RECIPES } from "@/lib/recipes";
import { token } from "@/lib/api";

const BENEFITS = [
  { icon: MoonStar, title: "Wake up to a briefing, not a backlog", body: "Overnight, your team follows up leads, answers calls and drafts replies. Each morning you get one page: what happened, what needs you." },
  { icon: Zap, title: "Start for $0 with your own AI", body: "Plug in free keys from Groq, Gemini or OpenRouter. aiOS rotates between them, so when one runs out the next one takes over." },
  { icon: ShieldCheck, title: "You stay in charge", body: "Contracts, payments and anything irreversible wait for your approval. Every action is logged." },
  { icon: Globe2, title: "Built for the Gulf", body: "Arabic and English in every channel: calls, WhatsApp, email. Working hours and tone follow your market." },
  { icon: LayoutGrid, title: "A home screen that's yours", body: "Pick the widgets you care about, build a dashboard per role, and rearrange them any time." },
  { icon: Lock, title: "Your keys stay yours", body: "Keys are encrypted before they're stored, shown only as the last four characters, and never leave your workspace." },
];
const PLANS = [
  { name: "Free", price: "$0", blurb: "See everything. Run it on your own AI keys.", cta: "Start free", hot: false, items: ["All 27 agents visible and ready", "Bring your own AI keys, unlimited failover", "Remixable dashboards", "Recipes and SOP engine", "25 leads per month", "Outreach and calls on paid plans"] },
  { name: "Starter", price: "$149", blurb: "For a small team getting going.", cta: "Choose Starter", hot: false, items: ["Everything in Free", "1,000 leads, 2,000 outreach per month", "300 AI calls per month", "3 seats", "Managed AI included"] },
  { name: "Growth", price: "$499", blurb: "For teams that sell every day.", cta: "Choose Growth", hot: true, items: ["Everything in Starter", "5,000 leads, 10,000 outreach per month", "1,500 AI calls per month", "10 seats", "Priority support"] },
  { name: "Scale", price: "$1,499", blurb: "For multi-brand operations.", cta: "Choose Scale", hot: false, items: ["Everything in Growth", "25,000 leads, 60,000 outreach per month", "8,000 AI calls per month", "30 seats", "Custom limits on request"] },
];
const FAQ = [
  ["What does the Free plan include?", "You can explore every part of aiOS and run the agents on your own AI keys. Sending outreach and taking calls through aiOS needs a paid plan. There's no time limit and no card required."],
  ["Which AI providers can I use?", "Claude, OpenAI, Google Gemini, Groq, OpenRouter, Mistral, DeepSeek, Cerebras, Together, xAI, Perplexity, or any OpenAI-compatible endpoint such as Ollama. Add several and aiOS fails over in the order you choose."],
  ["Can agents act without asking me?", "They handle routine work on their own, like drafting, researching and logging. Anything sensitive, such as sending contracts, spending money or deleting data, waits in your approval queue."],
  ["Does it work in Arabic?", "Yes. Agents reply in the language your customer uses, and the receptionist answers calls in Arabic or English."],
  ["Is my data separate from other companies?", "Every workspace is isolated. Your leads, knowledge and keys are only visible to your team."],
];

export default function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(!!token()), []);
  const start = signedIn ? "/dashboard" : "/login?mode=register";

  return (
    <div className="bg-paper">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2"><LogoMark /><Wordmark /></Link>
          <nav className="hidden gap-7 text-sm font-medium text-ink/70 md:flex" aria-label="Sections">
            <a href="#team" className="hover:text-ink">Team</a><a href="#why" className="hover:text-ink">Why aiOS</a><a href="#pricing" className="hover:text-ink">Pricing</a><a href="#faq" className="hover:text-ink">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            {!signedIn && <Link href="/login" className="hidden px-3 py-2 text-sm font-semibold sm:block">Sign in</Link>}
            <Link href={start} className="btn">{signedIn ? "Open aiOS" : "Start free"}</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:pt-20">
        <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.05] sm:text-6xl">Run your company with a team that never clocks out.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink/70">aiOS gives you an AI receptionist, salesperson, marketer, accountant and chief of staff who share one memory. Tell them what you want. Approve what matters. Hire. Delegate. Grow.</p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href={start} className="btn px-6 py-3 text-base">Start free<ArrowRight className="h-4 w-4" /></Link>
          <a href="#team" className="btn-ghost px-6 py-3 text-base">Meet the team</a>
          <span className="text-sm text-ink/55">No card. Bring your own AI key, free options included.</span>
        </div>
        <div className="mt-12"><Demo /></div>
      </section>

      <section id="team" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
        <h2 className="max-w-2xl text-4xl font-extrabold">Meet the people you didn't have to hire</h2>
        <p className="mt-3 max-w-xl text-ink/65">Eight of the 27 specialists you get from day one. Each one has a job, the tools to do it, and access to the same customer memory.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURED.map((r) => { const m = metaFor(r); return (
            <div key={r} className="flex min-h-[10.5rem] flex-col rounded-2xl p-5 text-white shadow-card transition hover:-translate-y-1 hover:shadow-lift" style={{ background: `linear-gradient(135deg, ${m.from}, ${m.to})` }}>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20"><m.icon className="h-5 w-5" /></span>
              <div className="mt-4 font-display text-lg font-bold">{m.title}</div>
              <p className="mt-1 text-sm leading-snug text-white/85">{m.blurb}</p>
            </div>); })}
        </div>
        <p className="mt-5 text-sm text-ink/55">Plus {Object.keys(AGENT_META).length - FEATURED.length}+ more: legal, procurement, security, project management, design, video and engineering.</p>
      </section>

      <section id="why" className="scroll-mt-20 bg-white py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="max-w-2xl text-4xl font-extrabold">What changes when your team is always on</h2>
          <div className="mt-10 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b.title}><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-signalSoft text-signal"><b.icon className="h-5 w-5" /></span>
                <h3 className="mt-4 text-lg font-bold">{b.title}</h3><p className="mt-1.5 leading-relaxed text-ink/65">{b.body}</p></div>))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-4xl font-extrabold">Set up in the time it takes to drink a coffee</h2>
            <ol className="mt-8 space-y-6">
              {[["Tell aiOS about your business", "What you sell, who you sell to, and how you like to sound."], ["Add an AI key", "Paste a free key from Groq or Gemini, or use the model you already pay for."], ["Give your first order", "Type it in plain language or run a ready-made recipe."]].map(([t, d], i) => (
                <li key={t} className="flex gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink font-display text-sm font-bold text-white">{i + 1}</span><div><div className="font-bold">{t}</div><div className="text-ink/65">{d}</div></div></li>))}
            </ol>
          </div>
          <div className="card">
            <div className="flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-signal" />One-click recipes</div>
            <div className="mt-4 flex flex-wrap gap-2">{RECIPES.slice(0, 12).map((r) => { const m = metaFor(r.role); return <span key={r.id} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm"><span className="h-2 w-2 rounded-full" style={{ background: m.from }} />{r.title}</span>; })}</div>
            <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-sm text-ink/65"><KeyRound className="h-4 w-4 text-signal" />Keys: Groq → Gemini → OpenRouter. If one is busy, the next answers.</div>
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 bg-white py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-4xl font-extrabold">Start free. Pay when it's earning its keep.</h2>
          <p className="mt-3 max-w-xl text-ink/65">Every plan includes the full team and dashboards. Paid plans add managed AI, outreach and calls.</p>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((p) => (
              <div key={p.name} className={`flex flex-col rounded-2xl border p-6 ${p.hot ? "border-signal bg-signalSoft/50 ring-2 ring-signal" : "border-line bg-white"}`}>
                <h3 className="text-lg font-bold">{p.name}</h3>
                <div className="mt-2 font-display text-4xl font-extrabold">{p.price}<span className="text-sm font-medium text-ink/50">/mo</span></div>
                <p className="mt-2 text-sm text-ink/65">{p.blurb}</p>
                <ul className="mt-5 flex-1 space-y-2 text-sm">{p.items.map((i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" />{i}</li>)}</ul>
                <Link href={start} className={`${p.hot || p.name === "Free" ? "btn" : "btn-ghost"} mt-6`}>{p.cta}</Link>
              </div>))}
          </div>
          <p className="mt-5 text-sm text-ink/55">Need custom limits, SLAs or on-premise hosting? Ask us about Enterprise.</p>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-5 py-16">
        <h2 className="text-4xl font-extrabold">Questions people ask first</h2>
        <div className="mt-8 divide-y divide-line rounded-2xl border border-line bg-white">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group p-5"><summary className="flex cursor-pointer list-none items-center justify-between font-bold">{q}<ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary><p className="mt-3 leading-relaxed text-ink/65">{a}</p></details>))}
        </div>
      </section>

      <section className="px-5 pb-20">
        <div className="mx-auto max-w-6xl rounded-3xl bg-gradient-to-br from-ink via-[#14296B] to-[#4B3AA8] px-6 py-14 text-center text-white">
          <h2 className="mx-auto max-w-2xl text-4xl font-extrabold">Your first day with a full team starts now</h2>
          <p className="mx-auto mt-3 max-w-lg text-white/75">Create a free workspace, paste an AI key, and give your first order.</p>
          <Link href={start} className="btn mt-7 bg-white px-7 py-3 text-base !text-ink">Start free<ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-sm text-ink/50">© {new Date().getFullYear()} aiOS. Hire. Delegate. Grow.</footer>
    </div>
  );
}
