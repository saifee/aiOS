"use client";
import useSWR from "swr";
import { fetcher, businessId } from "@/lib/api";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const money = (n: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(n || 0);
const HEALTH: Record<string, string> = { green: "#1F7A5C", yellow: "#C98A2D", red: "#B4452F" };

export default function BI() {
  const bid = businessId();
  const { data } = useSWR(bid ? `/businesses/${bid}/bi/overview` : null, fetcher);
  if (!data) return <p className="text-sm text-ink/50">Crunching the numbers…</p>;

  const kpis = [
    { label: "Revenue (MTD)", value: money(data.revenue.mtd) + " SAR" },
    { label: "Cash position", value: money(data.cash.position) + " SAR" },
    { label: "Cash runway", value: data.cash.runwayMonths != null ? data.cash.runwayMonths + " mo" : "—", warn: data.cash.runwayMonths != null && data.cash.runwayMonths < 3 },
    { label: "Weighted pipeline", value: money(data.pipeline.weightedValue) + " SAR", accent: true },
    { label: "Expected revenue", value: money(data.pipeline.expectedRevenue) + " SAR", accent: true },
    { label: "Overdue", value: money(data.receivables.overdueAmount) + " SAR", warn: data.receivables.overdueAmount > 0 },
    { label: "Conversion", value: data.sales.conversionRate + "%" },
    { label: "Satisfaction", value: data.satisfaction != null ? data.satisfaction + "%" : "—" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Business Intelligence</h1>
        <p className="text-sm text-ink/60">Every number computed live from the system of record — updated as your agents work.</p>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="card">
            <div className={`font-display text-2xl font-semibold ${k.warn ? "text-danger" : k.accent ? "text-signal" : ""}`}>{k.value}</div>
            <div className="mt-1 text-xs text-ink/50">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 text-sm font-semibold">Revenue trend (6 mo)</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.revenue.trend}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v: any) => money(v) + " SAR"} />
              <Line type="monotone" dataKey="revenue" stroke="#1F7A5C" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="mb-4 text-sm font-semibold">Pipeline by stage</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.pipeline.byStage.map((s: any) => ({ stage: s.stage.replace(/_/g, " ").toLowerCase(), count: s._count }))}>
              <XAxis dataKey="stage" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip />
              <Bar dataKey="count" fill="#C98A2D" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="mb-4 text-sm font-semibold">Project health</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.delivery.projectHealth.map((p: any) => ({ name: p.health, value: p._count }))} dataKey="value" nameKey="name" outerRadius={80} label>
                {data.delivery.projectHealth.map((p: any, i: number) => <Cell key={i} fill={HEALTH[p.health] ?? "#E4E1D8"} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="mb-4 text-sm font-semibold">This month at a glance</h2>
          <dl className="space-y-3 text-sm">
            {[["Deals won", data.sales.wonThisMonth], ["Avg deal size", money(data.sales.avgDealSize) + " SAR"], ["Calls handled", data.operations.callsThisMonth], ["AI agent runs", data.operations.agentRunsThisMonth], ["Recurring avg", money(data.cash.recurringAvg) + " SAR"], ["Outstanding invoices", money(data.receivables.outstanding) + " SAR"]].map(([k, v]: any) => (
              <div key={k} className="flex justify-between border-b border-line pb-2 last:border-0"><dt className="text-ink/60">{k}</dt><dd className="font-medium">{v}</dd></div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
