/**
 * AI Employees: eight roles, each a set of scheduled routines that prepare real work from the workspace's own data
 * (leads, inbox, campaigns, bookings, invoices) and leave it as a draft for the owner. Inspired by the open-source
 * "ai-employees" kits (MIT) but built to run inside aiOS on the owner's own AI keys, so free tiers are enough.
 *
 * Guardrail (always on): employees only DRAFT. They never send, post, publish or spend. The owner does the last click.
 */
export type Cadence = { days: string; hour: number; period: "day" | "week" | "month" };
export type Source = "profile" | "pipeline" | "newLeads" | "untouched" | "quiet" | "inbound" | "handoffs" | "outbound7" | "campaigns" | "social" | "invoices" | "bookings" | "prior" | "site" | "fleet" | "won";
export type Routine = {
  id: string; title: string; blurb: string; cadence: Cadence; sources: Source[];
  /** What to produce. Omit for purely deterministic routines. */
  task?: string;
  /** "posts" = the model returns JSON posts that are saved as unpublished social drafts. */
  format?: "markdown" | "posts";
  /** Deterministic section written before any model text (numbers, health checks). Costs nothing. */
  prelude?: "scoreboard" | "site" | "fleet";
  /** Needs no AI key at all. */
  noAi?: boolean;
};
export type Employee = { id: string; name: string; role: string; blurb: string; color: string; routines: Routine[]; needsWebsite?: boolean };

const D = (days: string, hour: number, period: Cadence["period"] = "day"): Cadence => ({ days, hour, period });

export const EMPLOYEES: Employee[] = [
  {
    id: "gtm", name: "GTM Engineer", role: "Go-to-market", color: "#3A5BFF",
    blurb: "Reads your new leads for buying signals, drafts today's first messages, scores the week, and re-tests who you are targeting.",
    routines: [
      { id: "gtm-signal-sweep", title: "Signal sweep", blurb: "Which new leads show a reason to talk now", cadence: D("mon-fri", 7), sources: ["profile", "newLeads", "prior"],
        task: "From NEW LEADS, pick the 5 with the strongest reason to contact now. For each: company, the specific signal from the data (pain point, growth signal, need), why now, and the best channel. If fewer than 5 have a real signal, list fewer." },
      { id: "gtm-outreach-queue", title: "Today's first touches", blurb: "Drafted first messages for leads nobody has contacted", cadence: D("mon-fri", 8), sources: ["profile", "untouched", "prior"],
        task: "Write a first message (email, under 90 words) for each of the top 3 UNTOUCHED leads. Personalise with facts from the data only. One clear ask. If a booking link is in PROFILE, offer it. Do not invent facts about the lead." },
      { id: "gtm-scoreboard", title: "Weekly scoreboard", blurb: "Numbers for the week, one thing to stop, one to scale", cadence: D("fri", 16, "week"), sources: ["profile", "pipeline", "outbound7", "campaigns", "prior"], prelude: "scoreboard",
        task: "Using the SCOREBOARD numbers and the data, say in 5 lines what the week shows, then name ONE thing to stop and ONE thing to scale, each with the number that justifies it." },
      { id: "gtm-icp-refresh", title: "Who to target (monthly)", blurb: "Tests your ideal-customer rules against what actually worked", cadence: D("last-weekday", 14, "month"), sources: ["profile", "won", "pipeline", "newLeads"],
        task: "Compare the ideal customer in PROFILE with WON/ADVANCED leads. Propose up to 3 specific edits to targeting (industries, countries, company size, keywords) and the evidence for each. If there is not enough data, say what data to collect." },
    ],
  },
  {
    id: "seo", name: "SEO / AEO Employee", role: "Search & AI answers", color: "#12B981", needsWebsite: true,
    blurb: "Plans keywords, drafts articles and FAQ answers that AI assistants can quote, and reviews what to fix.",
    routines: [
      { id: "seo-keyword-plan", title: "Keyword plan", blurb: "Topics worth writing this week", cadence: D("mon", 8, "week"), sources: ["profile", "prior"],
        task: "Propose 8 article topics for this business: target keyword, search intent, and why a buyer would search it. Prefer low-competition, buyer-intent topics in the business's markets. No traffic numbers (you have none)." },
      { id: "seo-article-draft", title: "Article draft", blurb: "One article draft each weekday", cadence: D("tue-fri", 9), sources: ["profile", "prior"],
        task: "Write ONE article draft (about 450 words): title, meta description under 155 characters, H2 headings, body, and a short FAQ of 3 questions. Pick the next unused topic from PRIOR keyword plan if present, otherwise choose a buyer-intent topic. Use only claims the business could stand behind." },
      { id: "seo-aeo-faq", title: "AI-answer FAQ + schema", blurb: "Quotable answers and FAQ markup", cadence: D("wed", 11, "week"), sources: ["profile", "inbound", "prior"],
        task: "Write 6 question-and-answer pairs that AI assistants could quote about this business, based on its services and the questions customers actually asked (INBOUND). Then output valid FAQPage JSON-LD in a code block." },
      { id: "seo-monthly-review", title: "Monthly review", blurb: "What to keep, change, retire", cadence: D("last-weekday", 13, "month"), sources: ["profile", "site", "prior"], prelude: "site",
        task: "Using the SITE CHECK and earlier drafts, list what to fix first on the site for search and AI visibility (max 5), and which drafted topics to publish first." },
    ],
  },
  {
    id: "webdev", name: "Web Dev Employee", role: "Site health", color: "#F59E0B", needsWebsite: true,
    blurb: "Checks your website every weekday (status, speed, basics, security headers) and tells you when something changes. No AI key needed.",
    routines: [
      { id: "web-site-health", title: "Site health check", blurb: "Is the site up, fast and well-formed", cadence: D("mon-fri", 7), sources: ["site"], prelude: "site", noAi: true },
    ],
  },
  {
    id: "social", name: "Social Media Employee", role: "Content", color: "#EC4899",
    blurb: "Drafts a week of posts in your tone, saved as unpublished drafts. Nothing is posted until you do it.",
    routines: [
      { id: "social-week-plan", title: "Week of posts", blurb: "Seven drafted posts, saved as drafts", cadence: D("mon", 8, "week"), sources: ["profile", "social", "prior"], format: "posts",
        task: "Draft 7 social posts for the week across linkedin, facebook, instagram and x, native to each channel, in the business tone, each with a concrete hook from the services or recent activity. No made-up stats or customer quotes. Return JSON: {\"headline\": string, \"posts\": [{\"channel\": \"linkedin|facebook|instagram|x\", \"content\": string}], \"needsYou\": [string]}." },
      { id: "social-monthly-retro", title: "Monthly review", blurb: "What was drafted, published, and what to change", cadence: D("last-weekday", 14, "month"), sources: ["profile", "social", "prior"],
        task: "Review the month from SOCIAL: how many posts were drafted vs published, which channels were neglected, and give 3 changes for next month." },
    ],
  },
  {
    id: "ads", name: "Ad Manager Employee", role: "Paid ads", color: "#8B5CF6",
    blurb: "Prepares ad angles, copy and negative keywords for you to paste into your ad account. It never touches spend.",
    routines: [
      { id: "ads-creative-set", title: "Creative set", blurb: "Three ad angles with copy and image briefs", cadence: D("mon", 9, "week"), sources: ["profile", "newLeads", "prior"],
        task: "Produce 3 ad angles for this business. For each: audience, hook, primary text (under 125 chars), headline (under 40), call to action, and a one-sentence image brief. Base angles on real pains in the data." },
      { id: "ads-build-sheet", title: "Campaign build sheet", blurb: "Structure + keywords to paste in", cadence: D("fri", 10, "week"), sources: ["profile", "campaigns", "prior"],
        task: "Write a search-campaign build sheet: 3 ad groups, 8 keywords each (with match type), 15 negative keywords, and daily budget guidance as a range with the assumption stated. Mark it clearly as a draft to paste; you cannot spend or edit any account." },
    ],
  },
  {
    id: "sales", name: "Sales Employee", role: "Outbound desk", color: "#0EA5E9",
    blurb: "Ranks who to contact today with reasons, drafts follow-ups for leads gone quiet, and reviews what is getting replies.",
    routines: [
      { id: "sales-prospect-sweep", title: "Who to contact today", blurb: "Ranked leads with the reason for each", cadence: D("mon-fri", 7), sources: ["profile", "untouched", "newLeads", "prior"],
        task: "Rank the 5 leads most worth contacting today from UNTOUCHED and NEW LEADS. For each give the reason using only the data and a one-line opener. State the score you were given." },
      { id: "sales-followups", title: "Follow-up drafts", blurb: "Nudges for leads who went quiet", cadence: D("mon-fri", 9), sources: ["profile", "quiet", "prior"],
        task: "For each QUIET lead (max 4), write a short follow-up (under 60 words) that adds something new and does not nag. Say which touch number it is if the data shows it." },
      { id: "sales-friday-review", title: "Friday review", blurb: "What is working and what to change", cadence: D("fri", 15, "week"), sources: ["profile", "pipeline", "outbound7", "won", "prior"], prelude: "scoreboard",
        task: "From the SCOREBOARD and data, say which segment or channel is getting replies, which qualification rule seems to select people who answer, and one change to try next week." },
    ],
  },
  {
    id: "csat", name: "Customer Satisfaction Employee", role: "Support desk", color: "#EF4444",
    blurb: "Sorts what customers wrote by urgency, drafts replies hardest first, and flags accounts going quiet or overdue.",
    routines: [
      { id: "csat-inbox-sweep", title: "Inbox sweep", blurb: "What customers wrote, by urgency", cadence: D("mon-fri", 7), sources: ["profile", "inbound", "handoffs"],
        task: "Sort INBOUND messages into URGENT, NORMAL and LOW with one line each (who, what they want, why that urgency). Mention HANDOFFS waiting on a human first. If there are no messages, say so in one line." },
      { id: "csat-reply-desk", title: "Reply drafts", blurb: "Drafted replies, hardest first", cadence: D("mon-fri", 8), sources: ["profile", "inbound", "prior"],
        task: "Draft replies for the 4 most urgent INBOUND messages, hardest first. Be warm and specific; acknowledge the problem before the answer; never promise refunds, dates or prices that are not in the data; flag anything that needs the owner's decision." },
      { id: "csat-churn-watch", title: "Churn watch", blurb: "Accounts going quiet, invoices overdue", cadence: D("mon-fri", 9), sources: ["profile", "quiet", "invoices", "won"],
        task: "Flag accounts at risk using only QUIET, INVOICES and WON data. For each flag show the evidence (days quiet, amount overdue) and one suggested action. Do not guess sentiment." },
      { id: "csat-deflection", title: "Answers to write once", blurb: "Repeated questions turned into FAQ answers", cadence: D("wed", 11, "week"), sources: ["profile", "inbound", "prior"],
        task: "Find questions that appear more than once in INBOUND/PRIOR and write the answer once, ready to add to the knowledge base. If nothing repeats, say that." },
    ],
  },
  {
    id: "cos", name: "Chief of Staff", role: "Watches the others", color: "#14296B",
    blurb: "Checks every employee's runs, names what quietly stopped, and brings three moves each Friday.",
    routines: [
      { id: "cos-fleet-check", title: "Fleet check", blurb: "What ran, what failed, what went quiet", cadence: D("mon-fri", 7), sources: ["fleet"], prelude: "fleet", noAi: true },
      { id: "cos-decision-brief", title: "Three moves", blurb: "Three decisions for the week with both sides", cadence: D("fri", 16, "week"), sources: ["profile", "pipeline", "outbound7", "fleet", "prior"], prelude: "fleet",
        task: "Pick exactly THREE moves for next week. For each: the move, one reason for, one reason against, and the number from the data behind it. Use only data shown." },
    ],
  },
];

export const ROUTINES: Record<string, { employee: Employee; routine: Routine }> = Object.fromEntries(
  EMPLOYEES.flatMap((e) => e.routines.map((r) => [r.id, { employee: e, routine: r }])));

/** Which agent on the team each scheduled role belongs to (one team, two ways of working: on request and on schedule). */
export const EMPLOYEE_AGENT: Record<string, string> = { gtm: "growth", seo: "marketing", social: "marketing", ads: "marketing", webdev: "cto", sales: "sales", csat: "customer_success", cos: "ceo_assistant" };
