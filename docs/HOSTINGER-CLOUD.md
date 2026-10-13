# Kingslee AIOS on Hostinger Cloud (Professional)

## How it runs here
One Node.js app = API + web UI + background workers (no Redis, no Python, no Docker).
Database = Supabase Postgres (pgvector). Recurring jobs (follow-ups, lead discovery, morning brief)
are driven by ONE Hostinger cron job that calls `/v1/cron/tick`.

Not available on Hostinger: the live phone-call bridge (`services/voice`) needs a long-lived WebSocket
server. Run it later on a small separate host and point Twilio to it. Everything else works.

## Before you start (Supabase)
1. Supabase → Database → Extensions → enable **vector**.
2. Supabase → Connect → **Session pooler** → copy the string (host looks like `aws-0-xx.pooler.supabase.com`).
   Do not use the `db.<ref>.supabase.co` direct host – it is IPv6-only and fails from Hostinger.
3. Rotate the secret key you pasted in chat earlier.

## Deploy
1. hPanel → Websites → Add website / your subdomain → **Node.js** (Node 22).
2. Import the GitHub repo `saifee/aiOS` (or upload the zip), branch `main`.
3. Settings:
   - Install + build command: `npm install && npm -w packages/db run generate && npm -w apps/web run build && npm -w apps/api run build`
   - Entry file: `app.js`
   - Framework: Other / Express
4. Environment variables: paste everything from `.env.hostinger` (filled in).
5. Deploy. First start creates the tables automatically (AUTO_MIGRATE).
6. Open `https://ai.kingslee.net/health` → `{"ok":true}`, then `/setup` to create the admin account.

## Turn on the background workers (one cron job)
hPanel → Advanced → **Cron Jobs** → every 5 minutes:

    curl -fsS "https://ai.kingslee.net/v1/cron/tick?key=YOUR_CRON_SECRET" > /dev/null

The endpoint only starts jobs that are actually due (follow-ups every 30 min, discovery every 6 h,
learning/growth scan/morning brief daily, social publishing every 5 min).

## Troubleshooting
- **403 / "Forbidden"** : the app did not start. hPanel → Node.js → *Logs*. Usual causes: missing env var,
  wrong entry file (must be `app.js`), build failed.
- **Prisma "P1001 can't reach database"** : you used the direct host; switch to the Session pooler string.
- **Tables missing** : set `AUTO_MIGRATE=true` and restart, or over SSH: `npm -w packages/db run migrate`.
- **Follow-ups never send** : the cron job is missing or `CRON_SECRET` differs.
