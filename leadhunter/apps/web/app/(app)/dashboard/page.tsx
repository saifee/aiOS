"use client";
import useSWR from "swr";
import { fetcher, businessId } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const STAGES = ["FOUND","QUALIFIED","CONTACTED","REPLIED","INTERESTED","MEETING_SCHEDULED","PROPOSAL_SENT","NEGOTIATION","WON"];

export default function Dashboard() {
  const bid = businessId();
  const { data } = useSWR(bid ? `/businesses/${bid}/analytics/overview` : null, fetcher);
  if (!bid) return <Empty />;
  if (!data) return <p className="text-sm text-ink/50">Loading the field report…</p>;

  const pipeline = STAGES.map((s) => ({ stage: s.replace("_", " ").toLowerCase(), count: data.pipeline?.find((p: any) => p.stage === s)?._count ?? 0 }));
  const stats = [
    { label: "Leads found today", value: data.leadsToday },
    { label: "Emails sent", value: data.emailsSent },
    { label: "WhatsApp sent", value: data.whatsappSent },
    { label: "Open rate", value: data.openRate + "%" },
    { label: "Reply rate", value: data.replyRate + "%" },
    { label: "Interested", value: data.positiveReplies, accent: true },
    { label: "Meetings booked", value: data.meetingsBooked, accent: true },
    { label: "Deals won", value: data.dealsWon, accent: true },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">While you were away</h1>
        <p className="text-sm text-ink/60">Everything your agent hunted, contacted, and closed in on.</p>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <div className={`font-display text-3xl font-semibold ${s.accent ? "text-signal" : ""}`}>{s.value}</div>
            <div className="mt-1 text-xs text-ink/50">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold">Pipeline</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={pipeline}>
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#1F7A5C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold">Agent suggestions</h2>
          {data.suggestions?.length ? data.suggestions.map((i: any) => (
            <div key={i.id} className="mb-3 rounded-lg bg-paper p-3 text-xs">
              <span className="tag mb-1">{i.kind.replace(/_/g, " ")}</span>
              <pre className="mt-1 whitespace-pre-wrap font-body text-ink/70">{JSON.stringify(i.data, null, 1).slice(0, 220)}</pre>
            </div>
          )) : <p className="text-xs text-ink/50">Learning loop runs nightly — insights appear here once your agent has outcomes to learn from.</p>}
        </div>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="card mx-auto mt-16 max-w-lg text-center">
      <h1 className="text-xl font-semibold">Set up your business</h1>
      <p className="mt-2 text-sm text-ink/60">Tell the agent what you sell and who you sell to — it takes it from there.</p>
      <a href="/settings" className="btn mt-5">Start setup</a>
    </div>
  );
}
