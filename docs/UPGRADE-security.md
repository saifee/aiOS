# Upgrading to the hardened release — read before deploying

These changes can break a working deployment if the matching settings are missing:

1. **`JWT_SECRET` must be ≥ 32 characters** in production, otherwise the app refuses to start (503 on Hostinger). Generate: `openssl rand -hex 32`. Changing it signs everyone out (fine).
2. **`ENCRYPTION_KEY` must be 64 hex chars.** Encryption no longer falls back to an all-zero key. If you previously stored AI keys/integration credentials under a *different* key they cannot be decrypted — re-enter them.
3. **Set `APP_URL`** (CORS allow-list) and **`TRUST_PROXY=true`** (so rate limits see real client IPs behind Hostinger).
4. **Webhooks are now authenticated.** Until you set the matching secret the endpoint answers 401: `WHATSAPP_APP_SECRET`, `TWILIO_AUTH_TOKEN` (+`APP_URL`), `SENDGRID_WEBHOOK_PUBLIC_KEY` or `WEBHOOK_SHARED_SECRET`, `CALCOM_WEBHOOK_SECRET` or `WEBHOOK_SHARED_SECRET`. See `docs/security/SECURE_DEPLOYMENT.md`.
5. Passwords: new minimum **10 characters** (existing accounts keep working). Registration rejects unknown fields.
6. `/setup/status` hides database error detail in production; set `SETUP_DEBUG=true` temporarily if you need it.
7. Cron: prefer `curl -H "x-cron-key: $CRON_SECRET" …/v1/cron/tick` (the `?key=` form still works).
8. Docker users: `DB_PASSWORD` / `DB_ROOT_PASSWORD` are now required; DB/Redis bind to 127.0.0.1.
9. Run `npm ci` (not `npm install`), Node 22 recommended. Next 16 / React 19 / Tailwind 4 / Fastify 5 are major upgrades.
10. The AI key "custom base URL" cannot point at localhost/private addresses on a hosted server (set `ALLOW_PRIVATE_AI_URLS=true` only when self-hosting Ollama etc.).

After deploying, re-run the Hostinger vulnerability scan.
