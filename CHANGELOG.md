# Changelog

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
