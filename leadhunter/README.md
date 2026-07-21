# Kingslee AIOS

**An AI Operating System for a software agency.** Every department — reception, sales, delivery, engineering, finance, marketing, growth — is an autonomous AI employee sharing one CRM, one Knowledge Brain, one calendar, one phone system, and one event bus. You open the Command Center each morning, see what ran overnight, approve what needs you, and type commands like *"call all schools in Jeddah with 500+ students."*

Built on the LeadHunter lead-engine core.

**Your autonomous AI sales employee (original core).** LeadHunter discovers leads for your business, verifies decision-maker contacts, scores fit, sends personalized outreach (email + WhatsApp), follows up on schedule, holds the conversation when leads reply, books meetings — and only interrupts you when there is a genuine opportunity.

Multi-tenant SaaS: any business (Spark-ED selling to GCC schools, an equipment-rental company in Riyadh, a clinic-software vendor…) configures its profile once and the agent hunts 24/7.

## Architecture

```
apps/web        Next.js 14 dashboard (pipeline kanban, campaigns, conversations, settings)
apps/api        Fastify REST API — auth, multi-tenant guard, CRM, webhooks (WhatsApp/SendGrid/inbound email/calendar)
apps/workers    BullMQ autonomous engine — discovery → enrichment → qualification → outreach → follow-up → conversation → notify → learning
services/ai     Python FastAPI microservice — Claude-powered scoring, message generation, reply agent
packages/db     Prisma schema (Postgres) — tenants, businesses, campaigns, leads, contacts, messages, conversations, meetings, insights, suppression, audit
packages/integrations  Provider clients — SendGrid/SES, WhatsApp Cloud API, Google Places/CSE/SerpAPI, Hunter, Apollo, Cal.com, Slack, Telegram
infra           Docker Compose (dev), Dockerfiles, Kubernetes manifests
```

## The autonomous loop

1. **Discovery** (every 6h per active campaign): Google Places + programmable search across directories, tenders, job posts, news. Normalize, dedupe (domain / name+city hash), respect negative keywords.
2. **Enrichment**: Hunter/Apollo verified decision-makers, company size & tech stack, website text capture. Confidence score 0–100. *No fabricated contacts, ever.*
3. **Qualification**: hybrid deterministic + Claude scoring (industry fit, size fit, pain points, buying intent, decision-maker access…). ≥ minLeadScore → QUALIFIED.
4. **Outreach**: personalized per company, per language (AR/EN auto by country). Four compliance gates: suppression list, daily cap, working hours, opt-out. WhatsApp uses Meta-approved templates.
5. **Follow-up**: day 3/7/14 (configurable), stops instantly on any reply.
6. **Conversation agent**: classifies intent, answers from configured facts only, shares booking link, escalates to human for quotes/negotiation/uncertainty.
7. **Notify**: owner pinged (email/Slack/Telegram/push) **only** for interested leads, meeting bookings, quote requests, high-value opportunities.
8. **Learning** (nightly): best industries, geos, send-times → dashboard insights.

## Quick start (dev)

```bash
cp .env.example .env        # fill ANTHROPIC_API_KEY at minimum
docker compose up -d postgres redis
npm install
npm -w packages/db run generate
npm -w packages/db run migrate:dev
npm -w packages/db run seed
# terminal 1
npm -w apps/api run dev
# terminal 2
npm -w apps/workers run dev
# terminal 3
cd services/ai && pip install -r requirements.txt && uvicorn main:app --reload
# terminal 4
npm -w apps/web run dev     # http://localhost:3000  (demo login: owner@demo.test / register a new account)
```

Or everything at once: `docker compose up --build`.

## Compliance by design

- Unsubscribe link + `List-Unsubscribe` header on every email; STOP/unsubscribe keywords (EN + AR) honored on WhatsApp/email instantly.
- Global suppression list (opt-outs, bounces, spam complaints) checked before every send.
- Per-business daily send caps and working-hours windows.
- WhatsApp business-initiated messages via approved Meta templates only (platform policy).
- LinkedIn is **not scraped** (ToS); person data comes from licensed providers (Hunter, Apollo).
- AES-256-GCM encryption for stored integration credentials; full audit log; strict tenant isolation on every route.

See `docs/` for architecture, API reference, deployment, and compliance detail.


## AI Operating System layer

On top of the lead engine sits the agent kernel (`packages/agents`) that turns the platform into an agency that runs itself:

- **Executive Command Center** — morning brief + natural-language command bar (CEO Assistant agent delegates across departments). `/command`
- **AI Workforce** — 27 department agents (reception, sales, CS, PM, product, CTO, dev swarm, QA, DevOps, security, UI/UX, graphic, video, marketing, BD, growth, finance, HR, legal, procurement, knowledge, analytics, exec reporting), each with a system prompt + tools. `/workforce`
- **AI Receptionist** — Twilio ↔ OpenAI Realtime voice bridge; answers calls in AR/EN, books meetings, logs to CRM. `/receptionist`
- **Knowledge Brain** — pgvector RAG every agent can search ("what do we know about this client?").
- **Event-driven orchestration** — agents react to events and message each other.
- **Human-in-the-loop** — sensitive actions (contracts, spend, refunds, deploys) require approval from the Command Center.
- **Audit** — every agent action logged.

See `docs/agent-os.md` and `docs/receptionist.md`. Run the extra service with `docker compose up voice`; the workers process now also runs the agent, orchestration, morning-brief (7am) and growth-scan (6am) loops.

### Before first run (Knowledge Brain)
```
psql "$DATABASE_URL" -f packages/db/prisma/migrations/manual/000_pgvector.sql   # enable pgvector
npm -w packages/db run migrate:dev
npm -w packages/db run seed                                                     # registers all department agents
```
