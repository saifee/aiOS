# aiOS on Hostinger Cloud — MySQL, no `npm install`

Runs as ONE Node.js app: API + web UI + background workers. Database = Hostinger's own MySQL/MariaDB.
No Redis, no Python, no Docker, nothing to install or build on the host.

## 1. Get the ready-to-upload package
You need `aios-hostinger.zip` (one-time build, ~80 MB because it carries the database engine
for every Linux flavour Hostinger might use):

- **GitHub:** push this repo → Actions → *Build Hostinger package* → Run workflow → download the artifact.
- **or your PC / any Linux box with Node 20:** `./scripts/package-hostinger.sh`

## 2. Create the database (hPanel → Databases → Management)
Create a database + user. Note the three names (look like `u123456789_aios`). Host is `localhost`.
`DATABASE_URL=mysql://USER:PASSWORD@localhost:3306/DBNAME`

## 3. Create the Node.js app (hPanel → Websites → ai.saifullahkhalid.com → Node.js)
- Node version 20 or 22
- Upload `aios-hostinger.zip` (File Manager → upload → extract into the app folder, or the upload option in the Node.js screen)
- Entry file: `app.js`      Build command: *(leave empty)*      Install: *(skip / none)*
- Environment variables: everything in `.env.hostinger`, filled in
- Start / Restart

## 4. First start
Open `https://ai.saifullahkhalid.com/health` → `{"ok":true}`.
With `AUTO_MIGRATE=true` the 37 tables are created automatically on the first start.
Prefer to do it by hand? phpMyAdmin → select the database → Import → `packages/db/prisma/schema.sql`.
Then open `/setup` and create your admin account.

## 5. Turn on the background workers (one cron job)
hPanel → Advanced → Cron Jobs → every 5 minutes:

    curl -fsS "https://ai.saifullahkhalid.com/v1/cron/tick?key=YOUR_CRON_SECRET" > /dev/null

Only jobs that are due actually start (follow-ups 30 min, discovery 6 h, learning/growth scan/morning brief daily).

## Notes & limits
- Knowledge Brain search: embeddings are stored as JSON and compared inside the app (fine for thousands of
  chunks; move to a vector database later if it grows past that). Needs `OPENAI_API_KEY` for embeddings.
- Live phone-call receptionist (`services/voice`) needs a long-running WebSocket server – host it elsewhere later.
- Changing the data model later: edit `schema.prisma`, run `npm run db:sql`, and apply the new columns
  (locally `npm -w packages/db run migrate` against the database, or ALTER TABLE in phpMyAdmin).
  `schema.sql` only creates missing tables; it never alters existing ones.

## Troubleshooting
- **403 / blank page** – the app did not start. hPanel → Node.js → Logs. Usual causes: wrong entry file, missing env var.
- **Prisma "unable to load engine"** – send me the log line; the package carries engines for RHEL/Debian × OpenSSL 1.0/1.1/3.
- **"Access denied for user"** – wrong DATABASE_URL user/password (URL-encode special characters).
- **Follow-ups never send** – cron job missing or `CRON_SECRET` mismatch.
