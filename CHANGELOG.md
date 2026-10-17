# Changelog

## 1.2.0 — 2026-10-17
- Superadmin console: view all users, their workspaces and subscriptions, allocate plans, record manual payments (Settings → Users & subscriptions).
- Settings → Payment methods: Stripe (keys encrypted, write-only) and manual methods such as bank transfer; customers see them under Plan & billing.
- English/Arabic (RTL) and dark-mode switches on the homepage and in the app header; profile menu.
- Homepage and examples no longer reference schools or a specific city.
- Build fix: `npm run build` installs build tools (turbo, typescript, tailwind…) itself when the host skips devDependencies.
- Repo fix: corrected root files that had been uploaded under the wrong names (package.json, package-lock.json, .gitignore, .env.*, app.js, render.yaml, docker-compose.yml, README.md, .dockerignore).
- Removed `.env.hostinger` so no env file can override production variables. Set variables in hPanel.
- New DB tables `Payment`, `PlatformSetting`: run the end of `docs/upgrade-existing-database.sql` on existing databases.
