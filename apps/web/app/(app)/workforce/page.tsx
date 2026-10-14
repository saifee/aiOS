"use client";
import { Bot, Clapperboard, PhoneCall, Terminal } from "lucide-react";
import { PageHeader, Tabs, TabDef } from "@/components/Tabs";
import { useHashTab } from "@/lib/hooks";
import { CommandView } from "@/components/views/CommandView";
import { AgentsView } from "@/components/views/AgentsView";
import { ReceptionistView } from "@/components/views/ReceptionistView";
import { StudioView } from "@/components/views/StudioView";

const IDS = ["command", "agents", "receptionist", "studio"] as const;
type Id = (typeof IDS)[number];
const TABS: TabDef<Id>[] = [
  { id: "command", label: "Command center", icon: Terminal },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "receptionist", label: "Receptionist", icon: PhoneCall },
  { id: "studio", label: "Studio", icon: Clapperboard },
];

export default function Workforce() {
  const [tab, setTab] = useHashTab(IDS, "command");
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="AI Workforce" subtitle="Your whole AI team in one place. Give an order, assign a task, review calls, or create content." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "command" && <CommandView />}
      {tab === "agents" && <AgentsView />}
      {tab === "receptionist" && <ReceptionistView />}
      {tab === "studio" && <StudioView />}
    </div>
  );
}
