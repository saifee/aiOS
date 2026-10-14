import { LayoutDashboard, Users, MessagesSquare, Workflow, Settings, type LucideIcon } from "lucide-react";

export const NAV: { href: string; label: string; icon: LucideIcon; hint: string; keywords: string }[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, hint: "Your remixable dashboards", keywords: "dashboard overview widgets kpi" },
  { href: "/workforce", label: "AI Workforce", icon: Users, hint: "Command center, agents, receptionist, studio", keywords: "agents command ceo receptionist studio team approvals" },
  { href: "/comms", label: "Comms", icon: MessagesSquare, hint: "Leads, campaigns, conversations, intelligence", keywords: "leads campaigns conversations crm intelligence bi outreach email whatsapp" },
  { href: "/playbooks", label: "Playbooks", icon: Workflow, hint: "Recipes and SOPs your agents follow", keywords: "sop recipes automation process" },
  { href: "/settings", label: "Settings", icon: Settings, hint: "Business, AI keys, plan & billing", keywords: "business keys api billing plan profile" },
];

export const SUBPAGES: { href: string; label: string; keywords: string }[] = [
  { href: "/workforce#command", label: "Command Center", keywords: "ask tell run approvals" },
  { href: "/workforce#agents", label: "AI agents", keywords: "team ceo salesperson" },
  { href: "/workforce#receptionist", label: "AI Receptionist", keywords: "calls phone" },
  { href: "/workforce#studio", label: "Studio", keywords: "design images social swarm" },
  { href: "/comms#leads", label: "Leads", keywords: "crm pipeline prospects" },
  { href: "/comms#campaigns", label: "Campaigns", keywords: "hunt outreach" },
  { href: "/comms#conversations", label: "Conversations", keywords: "replies inbox" },
  { href: "/comms#intelligence", label: "Intelligence", keywords: "bi revenue expenses profit" },
  { href: "/settings#keys", label: "AI keys", keywords: "api bring your own byok openai gemini groq claude" },
  { href: "/settings#plan", label: "Plan & billing", keywords: "upgrade invoice subscription" },
  { href: "/settings#business", label: "Business profile", keywords: "services keywords targets" },
];
