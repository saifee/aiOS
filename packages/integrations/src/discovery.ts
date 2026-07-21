/**
 * Lead discovery sources. Each returns RawLead[] from PUBLIC, official APIs:
 *  - Google Places API (businesses by keyword + city)
 *  - Google Programmable Search / SerpAPI (directories, news, tenders, job posts)
 * Note on LinkedIn: scraping violates LinkedIn ToS. Person data comes from
 * licensed providers (Apollo/Hunter) in enrichment instead.
 */
export type RawLead = {
  companyName: string; website?: string; industry?: string;
  country?: string; city?: string; address?: string;
  phones?: string[]; sourceUrl?: string; source: string;
};

export async function discoverViaPlaces(keyword: string, city: string, country?: string): Promise<RawLead[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return [];
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.websiteUri,places.internationalPhoneNumber,places.primaryType",
    },
    body: JSON.stringify({ textQuery: `${keyword} in ${city}${country ? ", " + country : ""}`, maxResultCount: 20 }),
  });
  if (!res.ok) return [];
  const json: any = await res.json();
  return (json.places ?? []).map((p: any) => ({
    companyName: p.displayName?.text, website: p.websiteUri, industry: p.primaryType,
    city, country, address: p.formattedAddress,
    phones: p.internationalPhoneNumber ? [p.internationalPhoneNumber] : [],
    source: "google_places",
  })).filter((l: RawLead) => l.companyName);
}

export async function discoverViaSearch(query: string, opts: { city?: string; country?: string; source: string }): Promise<RawLead[]> {
  // Google Programmable Search (CSE) preferred; SerpAPI fallback.
  const results: { title: string; link: string; snippet: string }[] = [];
  if (process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ID) {
    const u = new URL("https://www.googleapis.com/customsearch/v1");
    u.searchParams.set("key", process.env.GOOGLE_CSE_API_KEY);
    u.searchParams.set("cx", process.env.GOOGLE_CSE_ID);
    u.searchParams.set("q", query);
    const json: any = await (await fetch(u)).json();
    for (const i of json.items ?? []) results.push({ title: i.title, link: i.link, snippet: i.snippet });
  } else if (process.env.SERPAPI_API_KEY) {
    const u = new URL("https://serpapi.com/search.json");
    u.searchParams.set("api_key", process.env.SERPAPI_API_KEY);
    u.searchParams.set("q", query);
    const json: any = await (await fetch(u)).json();
    for (const i of json.organic_results ?? []) results.push({ title: i.title, link: i.link, snippet: i.snippet });
  }
  return results.map((r) => ({
    companyName: r.title.split(/[|\-–]/)[0].trim(),
    website: safeOrigin(r.link), sourceUrl: r.link,
    city: opts.city, country: opts.country, source: opts.source,
  })).filter((l) => l.companyName.length > 2);
}

/** Query builders per source type — one search engine, many discovery strategies. */
export function buildQueries(b: { keywords: string[]; targetCities: string[]; targetCountries: string[]; industriesServed: string[] }, source: string): { query: string; city?: string; country?: string }[] {
  const out: { query: string; city?: string; country?: string }[] = [];
  const geos = b.targetCities.length ? b.targetCities : b.targetCountries;
  for (const kw of b.keywords.slice(0, 5)) {
    for (const geo of geos.slice(0, 6)) {
      switch (source) {
        case "directories": out.push({ query: `${kw} directory ${geo}`, city: geo }); break;
        case "tenders": out.push({ query: `${kw} tender OR RFP OR procurement ${geo}`, city: geo }); break;
        case "jobs": out.push({ query: `${kw} hiring "${geo}" site:linkedin.com/jobs OR site:indeed.com OR site:bayt.com`, city: geo }); break;
        case "news": out.push({ query: `"${kw}" (expansion OR "new branch" OR funding OR launch) ${geo}`, city: geo }); break;
        default: out.push({ query: `${kw} ${geo}`, city: geo });
      }
    }
  }
  return out;
}

function safeOrigin(link: string) { try { return new URL(link).origin; } catch { return undefined; } }
