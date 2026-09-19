# Kingslee AIOS — Hostinger Node.js app (LITE mode)

Runs the web dashboard + API in ONE Node process, using Supabase for the
database. Background workers, the Python AI service, and the voice receptionist
are OFF (shared hosting can't run them). AI features you trigger by hand
(Command Center, agent tasks, dev swarm, image generation) work; automatic
discovery/outreach/schedules do not.

## 1. Supabase database
- Create a Supabase project. Project Settings → Database → copy the connection string.
- Database → Extensions → enable **vector** (pgvector). Required — the schema uses it.

## 2. Create the tables (once)
From a machine with the repo + Node (or Hostinger's terminal), pointing at Supabase:
```
export DATABASE_URL="postgresql://postgres:...@db.xxxx.supabase.co:5432/postgres"
npm install
npm -w packages/db run generate
npm -w packages/db run migrate     # creates the vector extension + all tables
```

## 3. Hostinger Node.js app
- hPanel → Websites → your domain → Node.js app (or "Setup Node.js App").
- Application root: the repo folder.
- Application startup file: `apps/api/dist/server.js`
- Node version: 20+.
- Environment variables: copy from `.env.hostinger` (fill DATABASE_URL, ANTHROPIC_API_KEY, and the two secrets).
  - `LITE_MODE=true`, `NODE_ENV=production`, leave `PORT` and `REDIS_URL` unset.
- Deploy / build. Hostinger runs `npm install` and the build (`turbo run build`),
  which compiles the API and exports the frontend to `apps/web/out`. The API
  serves that frontend, so the whole app is at `https://ai.kingslee.net`.

## 4. First run
- Open `https://ai.kingslee.net/setup` → create your admin + company. Done.

## What works vs. not (LITE)
WORKS: login, setup wizard, CRM (businesses/leads/contacts), analytics/BI,
Command Center, assigning tasks to agents, dev swarm (synchronous), image
generation, manual actions.
OFF: auto lead discovery, auto outreach/follow-up, event-driven orchestration,
morning brief / growth cron, scheduled social posting, voice receptionist,
lead scoring/generation that ran in workers, SOP AI-generation (saves a manual
draft instead).

To turn those on later, run the full stack on a VPS with `docker compose up`
(Postgres+Redis+workers+AI+voice) — no code changes needed, just unset LITE_MODE.
