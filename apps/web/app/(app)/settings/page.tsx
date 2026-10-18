"use client";
import { Building2, CreditCard, KeyRound, Landmark, Plug, ShieldCheck } from "lucide-react";
import { PageHeader, Tabs, TabDef } from "@/components/Tabs";
import { useHashTab, useMe } from "@/lib/hooks";
import { BusinessView } from "@/components/views/BusinessView";
import { KeysView } from "@/components/views/KeysView";
import { BillingView } from "@/components/views/BillingView";
import { IntegrationsView } from "@/components/views/IntegrationsView";
import { AdminView } from "@/components/views/AdminView";
import { PaymentMethodsView } from "@/components/views/PaymentMethodsView";

const IDS = ["business", "keys", "integrations", "plan", "payments", "admin"] as const;
type Id = (typeof IDS)[number];
const ALL: TabDef<Id>[] = [
  { id: "business", label: "Business", icon: Building2 },
  { id: "keys", label: "AI keys", icon: KeyRound },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "plan", label: "Plan & billing", icon: CreditCard },
  { id: "payments", label: "Payment methods", icon: Landmark },
  { id: "admin", label: "Users & subscriptions", icon: ShieldCheck },
];

export default function Settings() {
  const [tab, setTab] = useHashTab(IDS, "business");
  const { data: me } = useMe();
  // The payment-method and user-management tabs exist only for the platform superadmin (the API enforces this too).
  const tabs = ALL.filter((t) => me?.superadmin || (t.id !== "payments" && t.id !== "admin"));
  const active: Id = tabs.some((t) => t.id === tab) ? tab : "business";
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Settings" subtitle="Teach aiOS about your business, connect your own AI models, and manage your plan." />
      <Tabs tabs={tabs} value={active} onChange={setTab} />
      {active === "business" && <BusinessView />}
      {active === "keys" && <KeysView />}
      {active === "integrations" && <IntegrationsView />}
      {active === "plan" && <BillingView />}
      {active === "payments" && me?.superadmin && <PaymentMethodsView />}
      {active === "admin" && me?.superadmin && <AdminView />}
    </div>
  );
}
