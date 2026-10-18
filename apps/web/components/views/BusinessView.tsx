"use client";
import useSWR from "swr";
import { useEffect, useState } from "react";
import { fetcher, api, businessId, setBusinessId } from "@/lib/api";

const empty = {
  name: "", description: "", services: "", industriesServed: "", targetCountries: "", targetCities: "",
  keywords: "", negativeKeywords: "", decisionMakerTitles: "Owner, CEO, Manager",
  maxOutreachPerDay: 50, workingHoursStart: "09:00", workingHoursEnd: "18:00",
  timezone: "Asia/Riyadh", languages: "en, ar", tone: "professional", calendarLink: "", minLeadScore: 60,
};

export function BusinessView() {
  // Read after mount: localStorage doesn't exist while the static page is prerendered.
  const [bid, setBid] = useState<string | null>(null);
  useEffect(() => setBid(businessId()), []);
  const { data: biz, mutate } = useSWR(bid ? `/businesses/${bid}` : null, fetcher);
  const [f, setF] = useState<any>(empty);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (biz) setF({
      ...biz,
      services: biz.services?.join(", "), industriesServed: biz.industriesServed?.join(", "),
      targetCountries: biz.targetCountries?.join(", "), targetCities: biz.targetCities?.join(", "),
      keywords: biz.keywords?.join(", "), negativeKeywords: biz.negativeKeywords?.join(", "),
      decisionMakerTitles: biz.decisionMakerTitles?.join(", "), languages: biz.languages?.join(", "),
      calendarLink: biz.calendarLink ?? "",
    });
  }, [biz]);

  const csv = (s: string) => s.split(",").map((x: string) => x.trim()).filter(Boolean);

  async function save() {
    const payload = {
      name: f.name, description: f.description || undefined,
      services: csv(f.services), industriesServed: csv(f.industriesServed),
      targetCountries: csv(f.targetCountries), targetCities: csv(f.targetCities),
      keywords: csv(f.keywords), negativeKeywords: csv(f.negativeKeywords),
      decisionMakerTitles: csv(f.decisionMakerTitles), languages: csv(f.languages),
      maxOutreachPerDay: Number(f.maxOutreachPerDay), minLeadScore: Number(f.minLeadScore),
      workingHoursStart: f.workingHoursStart, workingHoursEnd: f.workingHoursEnd,
      timezone: f.timezone, tone: f.tone, calendarLink: f.calendarLink || undefined,
    };
    if (bid) await api(`/businesses/${bid}`, { method: "PATCH", body: JSON.stringify(payload) });
    else {
      const b = await api(`/businesses`, { method: "POST", body: JSON.stringify(payload) });
      setBusinessId(b.id);
    }
    setSaved(true); setTimeout(() => setSaved(false), 2000); mutate();
  }

  const Field = ({ label, k, hint, type = "text" }: any) => (
    <label className="block">
      <span className="text-xs font-medium text-ink/60">{label}</span>
      <input className="input mt-1" type={type} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      {hint && <span className="text-xs text-ink/40">{hint}</span>}
    </label>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-ink/60">{bid ? "" : "Tell aiOS what you sell and who you sell to. Everything your agents know about your business comes from here."}</p>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold">What you sell</h2>
        <Field label="Business name" k="name" />
        <Field label="Description" k="description" hint="One paragraph the AI uses to pitch you." />
        <Field label="Services / products" k="services" hint="Comma-separated" />
        <Field label="Industries you serve" k="industriesServed" hint="e.g. Retail, Logistics, Healthcare" />
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold">Who to hunt</h2>
        <Field label="Target countries" k="targetCountries" hint="ISO codes: SA, AE, QA…" />
        <Field label="Target cities" k="targetCities" />
        <Field label="Search keywords" k="keywords" />
        <Field label="Negative keywords" k="negativeKeywords" hint="Never contact matches" />
        <Field label="Decision-maker titles" k="decisionMakerTitles" />
        <Field label="Minimum lead score to contact" k="minLeadScore" type="number" />
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-semibold">How to reach out</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Max outreach per day" k="maxOutreachPerDay" type="number" />
          <Field label="Timezone" k="timezone" />
          <Field label="Working hours start" k="workingHoursStart" />
          <Field label="Working hours end" k="workingHoursEnd" />
        </div>
        <Field label="Languages" k="languages" hint="en, ar, ur…" />
        <Field label="Tone" k="tone" hint="professional | friendly | consultative" />
        <Field label="Cal.com / Calendly link (optional)" k="calendarLink" hint="Used when you prefer an outside booking page over the built-in one (see Bookings)" />
      </section>

      <button className="btn" onClick={save}>{saved ? "Saved ✓" : bid ? "Save changes" : "Create business & start hunting"}</button>
    </div>
  );
}
