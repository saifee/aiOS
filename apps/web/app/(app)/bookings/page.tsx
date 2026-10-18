"use client";
import { CalendarCheck, CalendarDays, Clock, Link2, ListChecks } from "lucide-react";
import { PageHeader, Tabs, TabDef } from "@/components/Tabs";
import { useHashTab } from "@/lib/hooks";
import { BookingsView } from "@/components/views/BookingsView";

const IDS = ["upcoming", "link", "availability", "types", "calendar"] as const;
type Id = (typeof IDS)[number];
const TABS: TabDef<Id>[] = [
  { id: "upcoming", label: "Upcoming", icon: CalendarCheck },
  { id: "link", label: "Booking link", icon: Link2 },
  { id: "availability", label: "Availability", icon: Clock },
  { id: "types", label: "Meeting types", icon: ListChecks },
  { id: "calendar", label: "Calendar export", icon: CalendarDays },
];

export default function Bookings() {
  const [tab, setTab] = useHashTab(IDS, "upcoming");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Bookings" subtitle="Let people book time with you. Your AI shares the link instead of going back and forth, and every booking lands in your calendar." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <BookingsView tab={tab} />
    </div>
  );
}
