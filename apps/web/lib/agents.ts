import { Briefcase, PhoneCall, Handshake, Megaphone, Calculator, HeartHandshake, UserSearch, Scale, Rocket, LineChart, Palette, Code2, ShieldCheck, ClipboardList, BrainCircuit, Boxes, Video, ShoppingCart, type LucideIcon } from "lucide-react";

export type AgentMeta = { title: string; blurb: string; icon: LucideIcon; from: string; to: string; ask: string };

/** The faces of the workforce: friendly names, one-line jobs and a colour per card. */
export const AGENT_META: Record<string, AgentMeta> = {
  ceo_assistant:       { title: "CEO Assistant",      blurb: "Turns plain-language orders into work across every department.", icon: Briefcase, from: "#4F46E5", to: "#7C3AED", ask: "Give me my priorities for today" },
  receptionist:        { title: "AI Receptionist",    blurb: "Answers calls and chats 24/7 in Arabic and English.",            icon: PhoneCall, from: "#0891B2", to: "#0EA5E9", ask: "Draft a greeting script for incoming calls" },
  sales:               { title: "AI Salesperson",     blurb: "Qualifies, follows up, handles objections and books demos.",    icon: Handshake, from: "#059669", to: "#10B981", ask: "Follow up with everyone who got a proposal last week" },
  marketing:           { title: "AI Marketing",       blurb: "Plans and writes content for every channel.",                    icon: Megaphone, from: "#DB2777", to: "#F43F5E", ask: "Plan this week's LinkedIn content" },
  finance:             { title: "AI Finance",         blurb: "Tracks cash, drafts invoices, chases late payments.",            icon: Calculator, from: "#D97706", to: "#F59E0B", ask: "Which invoices are overdue?" },
  customer_success:    { title: "Customer Success",   blurb: "Onboards clients and spots unhappy ones early.",                 icon: HeartHandshake, from: "#E11D48", to: "#FB7185", ask: "Which clients need a check-in?" },
  hr:                  { title: "AI HR & Recruiting", blurb: "Screens CVs, schedules interviews, builds onboarding.",          icon: UserSearch, from: "#7C3AED", to: "#A78BFA", ask: "Create an interview kit for a sales hire" },
  legal:               { title: "AI Legal",           blurb: "Drafts NDAs and contracts; nothing leaves without approval.",    icon: Scale, from: "#475569", to: "#64748B", ask: "Draft a mutual NDA" },
  growth:              { title: "Growth Agent",       blurb: "Scans daily for new markets, tenders and opportunities.",        icon: Rocket, from: "#EA580C", to: "#FB923C", ask: "Find 5 new opportunities this week" },
  analytics:           { title: "AI Analyst",         blurb: "Turns activity into answers and flags anomalies.",               icon: LineChart, from: "#2563EB", to: "#60A5FA", ask: "What changed in my pipeline this month?" },
  graphic_designer:    { title: "Graphic Designer",   blurb: "Logos, posts, flyers and ads on demand.",                        icon: Palette, from: "#C026D3", to: "#E879F9", ask: "Design a launch announcement post" },
  video_creator:       { title: "Video Creator",      blurb: "Scripts and renders reels, demos and explainers.",               icon: Video, from: "#9333EA", to: "#C084FC", ask: "Write a 30-second product teaser" },
  cto:                 { title: "AI CTO",             blurb: "Reviews architecture, flags risk, commissions builds.",          icon: Code2, from: "#0F766E", to: "#14B8A6", ask: "Review our security posture" },
  security:            { title: "Security Engineer",  blurb: "Triages alerts and enforces secure defaults.",                   icon: ShieldCheck, from: "#B91C1C", to: "#EF4444", ask: "Run a quick security checklist" },
  project_manager:     { title: "Project Manager",    blurb: "Plans delivery, tracks delays, keeps clients updated.",          icon: ClipboardList, from: "#0369A1", to: "#38BDF8", ask: "Summarize projects at risk" },
  knowledge_manager:   { title: "Knowledge Brain",    blurb: "Remembers everything the company knows.",                        icon: BrainCircuit, from: "#4338CA", to: "#818CF8", ask: "What do we know about our top client?" },
  business_development:{ title: "Business Development", blurb: "Finds partnerships, tenders and new verticals.",              icon: Boxes, from: "#15803D", to: "#4ADE80", ask: "Find partnership ideas in our market" },
  procurement:         { title: "AI Procurement",     blurb: "Sources vendors and compares quotes.",                           icon: ShoppingCart, from: "#A16207", to: "#EAB308", ask: "Compare three vendors for hosting" },
};
export const FEATURED = ["ceo_assistant", "receptionist", "sales", "marketing", "finance", "customer_success", "hr", "growth"];
export const metaFor = (role: string, fallbackName?: string): AgentMeta =>
  AGENT_META[role] ?? { title: fallbackName ?? role, blurb: "Specialist agent on your team.", icon: Boxes, from: "#334155", to: "#64748B", ask: "What can you do for me?" };
