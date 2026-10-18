# Changelog

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
