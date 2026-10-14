"use client";
import { Building2, CreditCard, KeyRound } from "lucide-react";
import { PageHeader, Tabs, TabDef } from "@/components/Tabs";
import { useHashTab } from "@/lib/hooks";
import { BusinessView } from "@/components/views/BusinessView";
import { KeysView } from "@/components/views/KeysView";
import { BillingView } from "@/components/views/BillingView";

const IDS = ["business", "keys", "plan"] as const;
type Id = (typeof IDS)[number];
const TABS: TabDef<Id>[] = [
  { id: "business", label: "Business", icon: Building2 },
  { id: "keys", label: "AI keys", icon: KeyRound },
  { id: "plan", label: "Plan & billing", icon: CreditCard },
];

export default function Settings() {
  const [tab, setTab] = useHashTab(IDS, "business");
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Settings" subtitle="Teach aiOS about your business, connect your own AI models, and manage your plan." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "business" && <BusinessView />}
      {tab === "keys" && <KeysView />}
      {tab === "plan" && <BillingView />}
    </div>
  );
}
