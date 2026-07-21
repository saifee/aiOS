/**
 * Contact & company enrichment via licensed data providers.
 * Never fabricates data — only returns what providers verify.
 */
export type EnrichedContact = { name?: string; title?: string; email?: string; phone?: string; linkedin?: string; verified: boolean; sourceUrl?: string };

export async function findContactsByDomain(domain: string, titles: string[]): Promise<EnrichedContact[]> {
  const out: EnrichedContact[] = [];

  if (process.env.HUNTER_API_KEY) {
    const u = new URL("https://api.hunter.io/v2/domain-search");
    u.searchParams.set("domain", domain);
    u.searchParams.set("api_key", process.env.HUNTER_API_KEY);
    const json: any = await (await fetch(u)).json().catch(() => ({}));
    for (const e of json?.data?.emails ?? []) {
      out.push({
        name: [e.first_name, e.last_name].filter(Boolean).join(" ") || undefined,
        title: e.position ?? undefined, email: e.value,
        linkedin: e.linkedin ?? undefined, verified: e.verification?.status === "valid",
        sourceUrl: e.sources?.[0]?.uri,
      });
    }
  }

  if (out.length === 0 && process.env.APOLLO_API_KEY) {
    const res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": process.env.APOLLO_API_KEY },
      body: JSON.stringify({ q_organization_domains: domain, person_titles: titles, page: 1, per_page: 5 }),
    });
    const json: any = await res.json().catch(() => ({}));
    for (const p of json?.people ?? []) {
      out.push({ name: p.name, title: p.title, email: p.email ?? undefined, linkedin: p.linkedin_url, verified: p.email_status === "verified" });
    }
  }

  // Rank by title match
  const rank = (t?: string) => titles.findIndex((x) => t?.toLowerCase().includes(x.toLowerCase()));
  return out.sort((a, b) => (rank(a.title) === -1 ? 99 : rank(a.title)) - (rank(b.title) === -1 ? 99 : rank(b.title)));
}

export async function enrichCompany(domain: string): Promise<{ employeeCount?: number; techStack?: string[]; industry?: string }> {
  if (!process.env.APOLLO_API_KEY) return {};
  const res = await fetch(`https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`, {
    headers: { "X-Api-Key": process.env.APOLLO_API_KEY },
  });
  const json: any = await res.json().catch(() => ({}));
  const org = json?.organization;
  return org ? { employeeCount: org.estimated_num_employees, techStack: org.technology_names?.slice(0, 15), industry: org.industry } : {};
}

/** Fetch homepage text for AI website analysis (pain points, current software, quality). */
export async function fetchWebsiteText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 8000);
  } catch { return ""; }
}
