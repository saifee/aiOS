"use client";
import { BarChart3, Megaphone, MessageCircle, Users } from "lucide-react";
import { PageHeader, Tabs, TabDef } from "@/components/Tabs";
import { useHashTab } from "@/lib/hooks";
import { LeadsView } from "@/components/views/LeadsView";
import { CampaignsView } from "@/components/views/CampaignsView";
import { ConversationsView } from "@/components/views/ConversationsView";
import { IntelView } from "@/components/views/IntelView";

const IDS = ["leads", "campaigns", "conversations", "intelligence"] as const;
type Id = (typeof IDS)[number];
const TABS: TabDef<Id>[] = [
  { id: "leads", label: "Leads", icon: Users },
  { id: "campaigns", label: "Campaigns", icon: Megaphone },
  { id: "conversations", label: "Conversations", icon: MessageCircle },
  { id: "intelligence", label: "Intelligence", icon: BarChart3 },
];

export default function Comms() {
  const [tab, setTab] = useHashTab(IDS, "leads");
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Comms" subtitle="Everyone you talk to, and how it's going: leads, outreach campaigns, live conversations and the numbers behind them." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "leads" && <LeadsView />}
      {tab === "campaigns" && <CampaignsView />}
      {tab === "conversations" && <ConversationsView />}
      {tab === "intelligence" && <IntelView />}
    </div>
  );
}
