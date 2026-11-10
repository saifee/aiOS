"use client";
import { Bot, CalendarClock, Clapperboard, PhoneCall, Terminal } from "lucide-react";
import { PageHeader, Tabs, TabDef } from "@/components/Tabs";
import { useHashTab } from "@/lib/hooks";
import { CommandView } from "@/components/views/CommandView";
import { AgentsView } from "@/components/views/AgentsView";
import { ReceptionistView } from "@/components/views/ReceptionistView";
import { EmployeesView } from "@/components/views/EmployeesView";
import { StudioView } from "@/components/views/StudioView";

const IDS = ["command", "agents", "routines", "receptionist", "studio"] as const;
type Id = (typeof IDS)[number];
const TABS: TabDef<Id>[] = [
  { id: "command", label: "Command center", icon: Terminal },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "routines", label: "Scheduled routines", icon: CalendarClock },
  { id: "receptionist", label: "Receptionist", icon: PhoneCall },
  { id: "studio", label: "Studio", icon: Clapperboard },
];

export default function Workforce() {
  const [tab, setTab] = useHashTab(IDS, "command");
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="AI Workforce" subtitle="Your whole AI team in one place. Give an order, assign a task, let roles run scheduled routines, review calls, or create content." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "command" && <CommandView />}
      {tab === "agents" && <AgentsView />}
      {tab === "routines" && <EmployeesView />}
      {tab === "receptionist" && <ReceptionistView />}
      {tab === "studio" && <StudioView />}
    </div>
  );
}
