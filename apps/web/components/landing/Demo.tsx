"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Terminal } from "lucide-react";
import { metaFor } from "@/lib/agents";

const SCENES = [
  { cmd: "Call every school in Jeddah with 500+ students", steps: [
    { role: "receptionist", text: "Dialing 14 schools in Arabic and English" },
    { role: "sales", text: "6 qualified, 3 demos booked this week" },
    { role: "ceo_assistant", text: "Briefing for tomorrow's 9:00 meetings ready" } ] },
  { cmd: "Chase every invoice unpaid for 30+ days", steps: [
    { role: "finance", text: "5 polite reminders drafted, waiting for your OK" },
    { role: "customer_success", text: "2 accounts flagged as unhappy" },
    { role: "ceo_assistant", text: "One-page summary sent to you" } ] },
  { cmd: "Plan this week's LinkedIn posts in Arabic and English", steps: [
    { role: "marketing", text: "5 posts written, hooks tested" },
    { role: "graphic_designer", text: "5 matching images created" },
    { role: "growth", text: "3 trending topics in your market added" } ] },
];

/** The hero's one moving part: a command is typed, three agents pick it up, results land. */
export function Demo() {
  const [scene, setScene] = useState(0);
  const [typed, setTyped] = useState(0);
  const [done, setDone] = useState(0);
  const [still, setStill] = useState(false);
  const s = SCENES[scene];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setStill(true); setTyped(SCENES[0].cmd.length); setDone(3); }
  }, []);

  useEffect(() => {
    if (still) return;
    let t: any;
    if (typed < s.cmd.length) t = setTimeout(() => setTyped(typed + 1), 32);
    else if (done < 3) t = setTimeout(() => setDone(done + 1), 900);
    else t = setTimeout(() => { setScene((scene + 1) % SCENES.length); setTyped(0); setDone(0); }, 3200);
    return () => clearTimeout(t);
  }, [typed, done, scene, still, s.cmd.length]);

  return (
    <div className="rounded-3xl bg-gradient-to-br from-ink via-[#14296B] to-[#4B3AA8] p-4 text-white shadow-lift sm:p-6" aria-label="Example of aiOS running a command">
      <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
        <Terminal className="h-5 w-5 shrink-0 text-[#9DB0FF]" />
        <span className="min-h-[1.5rem] text-sm sm:text-base">{s.cmd.slice(0, typed)}{typed < s.cmd.length && <span className="caret">|</span>}</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {s.steps.map((st, i) => {
          const m = metaFor(st.role); const on = i < done; const working = !on && typed >= s.cmd.length && i === done;
          return (
            <div key={st.role + i} className={`rounded-2xl p-4 transition-all duration-500 ${on || working ? "opacity-100" : "opacity-40"}`} style={{ background: `linear-gradient(135deg, ${m.from}, ${m.to})` }}>
              <div className="flex items-center justify-between"><m.icon className="h-5 w-5" />{on ? <CheckCircle2 className="h-4 w-4 text-white" /> : working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}</div>
              <div className="mt-3 text-sm font-bold">{m.title}</div>
              <div className="mt-0.5 min-h-[2.5rem] text-sm text-white/90">{on ? st.text : working ? "Working on it…" : "Waiting"}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-white/50">Example run. Sensitive steps always wait for your approval.</p>
    </div>
  );
}
