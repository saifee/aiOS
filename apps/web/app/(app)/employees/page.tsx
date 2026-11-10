"use client";
import { PageHeader } from "@/components/Tabs";
import { EmployeesView } from "@/components/views/EmployeesView";

export default function Employees() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="AI Employees" subtitle="Eight roles that run routines on a schedule and leave you finished drafts. They never send or spend without you." />
      <EmployeesView />
    </div>
  );
}
