# Changelog

## 1.6.1

- Fix: AI key tests failing with "unexpected model name format" or "model not found". Model names are now validated (one model ID, no spaces or commas); bad values already saved (for example text pasted from a dropdown) are ignored and the provider default is used instead. Gemini shorthand such as `gemini-flash` is repaired automatically.
- New: "Use the default model" button on a key, and "Re-enter this key" when a saved key can no longer be decrypted (the server's `ENCRYPTION_KEY` changed after it was saved). Keep `ENCRYPTION_KEY` the same forever once keys are stored.

## 1.6.0 (security)

- **CAPTCHA** on sign-in, sign-up, first-run setup and public booking: Cloudflare Turnstile or Google reCAPTCHA v2 (`CAPTCHA_PROVIDER`, `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET`). Off until configured; the app warns when it is off in production.
- **Brute-force lockout**: 5 wrong passwords per email+IP, 25 per email, 40 per IP, then 15 minutes (HTTP 429 + Retry-After).
- Password strength check (common, repetitive or personal passwords refused).
- Fix: guest-supplied text is now escaped in booking emails; meeting/booking links must be http(s).
- Fix: unknown URLs return a real 404 (not the home page); only GET/HEAD are accepted for pages.
- Full audit report: `docs/security/AUDIT-2026-10.md`.

## 1.5.1

- Fix: Google Gemini keys failed their test with "model gemini-2.0-flash is no longer available". The default is now the always-current `gemini-flash-latest`. Existing Gemini keys pick this up automatically (press Test again after updating); a key with its own model name typed in keeps it.

## 1.5.0

- **Chief of Staff** on the dashboard: a daily briefing (meetings, new leads, approvals, overdue tasks, failed AI runs) shown when you sign in, with a chat box for follow-up questions. Optional daily email at a time you choose, plus "Email it now". Email needs `SENDGRID_API_KEY` (or SES) and `DEFAULT_FROM_EMAIL`.
- **Bookings** menu: built-in booking page (`/book?b=<link-name>`) with meeting types, weekly availability, time zone, notice and buffer; guests get a confirmation with Add-to-Google-Calendar and .ics links and can cancel; you get a notification and email.
- **Calendar export**: download an .ics file or subscribe to a private calendar feed from Google, Outlook or Apple Calendar.
- The AI now shares your aiOS booking link (or your Cal.com / Calendly link if you prefer) in outreach, follow-ups and conversations, and agents have a `get_booking_link` tool.
- New `Booking` table (created automatically on start). Daily emails are sent by the scheduler tick, so keep `INLINE_SCHEDULER` on or call `/v1/cron/tick` every 5 minutes.

## 1.4.2

- Fix: login page refreshing endlessly in Chrome, Samsung Internet and other browsers. A saved but expired sign-in made the page's own background request fail with 401, which reloaded /login forever. Expired tokens are now cleared and the login page is never reloaded.

## 1.4.1

- Fix: login page refreshing in a loop on phones. Pages are now served with `Cache-Control: no-cache` (so a phone never keeps an old page pointing at deleted files after a redeploy) and build files with long-lived immutable caching.
- Google Fonts are now allowed by the content security policy, so the intended fonts load.

## 1.4.0

- Sign in with Google and Microsoft (work or personal accounts). Buttons appear on the login page once the client ID and secret are set; see `.env.example`.
- Accounts are matched by provider identity. An existing account is only linked by email when the provider vouches for that email, which prevents account takeover through unverified Microsoft work emails.
- New `OAuthIdentity` table (created automatically on start).

## 1.3.0

- Fix: "Body cannot be empty" 400 on Talk to us / Manage payment. Requests without a body no longer send a JSON content-type.
- Manage payment only shows when a Stripe subscription exists; Talk to us opens an email to CONTACT_EMAIL (or the first SUPERADMIN_EMAILS entry).
- Fix: `AiKey` / missing-table errors on older databases. Tables are created automatically at start (AUTO_SCHEMA=false disables); missing-table errors now return a clear 503.
- Multiple companies (up to 25) with an Add company button.
- Personal space mode: assistant for individuals with no company (personal recipes and command ideas, no company-only sections).
- WhatsApp Business Cloud API per company: Settings -> Integrations (save, test, webhook URL, verify token), per-company signature checking and sending.

## 1.2.0 — 2026-10-17
- Superadmin console: view all users, their workspaces and subscriptions, allocate plans, record manual payments (Settings → Users & subscriptions).
- Settings → Payment methods: Stripe (keys encrypted, write-only) and manual methods such as bank transfer; customers see them under Plan & billing.
- English/Arabic (RTL) and dark-mode switches on the homepage and in the app header; profile menu.
- Homepage and examples no longer reference schools or a specific city.
- Build fix: `npm run build` installs build tools (turbo, typescript, tailwind…) itself when the host skips devDependencies.
- Repo fix: corrected root files that had been uploaded under the wrong names (package.json, package-lock.json, .gitignore, .env.*, app.js, render.yaml, docker-compose.yml, README.md, .dockerignore).
- Removed `.env.hostinger` so no env file can override production variables. Set variables in hPanel.
- New DB tables `Payment`, `PlatformSetting`: run the end of `docs/upgrade-existing-database.sql` on existing databases.
