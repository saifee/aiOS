# Secure Deployment — Hostinger (Node.js app, no Docker/Redis)

## Required environment variables
`NODE_ENV=production`, `APP_URL=https://aios.saifullahkhalid.com`, `DATABASE_URL`, `JWT_SECRET` (≥ 32 chars), `ENCRYPTION_KEY` (64 hex), `CRON_SECRET`, `TRUST_PROXY=true`, `AUTO_MIGRATE=true` (first deploy). Strongly recommended: `SETUP_TOKEN` until the first admin is created, then remove it. Webhook secrets only for the providers you use (`WHATSAPP_APP_SECRET`, `TWILIO_AUTH_TOKEN`, `SENDGRID_WEBHOOK_PUBLIC_KEY` or `WEBHOOK_SHARED_SECRET`, `CALCOM_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`).

**The app refuses to start in production if `JWT_SECRET` is missing, < 32 chars or a known default.** If the site shows a 503 after redeploying, check the Node.js app log in hPanel for "Refusing to start".

## Steps
1. Upload the new package, set Node.js to **22.x**, run `npm ci` then `npm run build` (hPanel build step), restart.
2. Set env vars above; rotate any credential ever pasted into chat/e-mail (R-01).
3. Cron (hPanel → Cron Jobs, every 5 min): `curl -fsS -H "x-cron-key: $CRON_SECRET" https://aios.saifullahkhalid.com/v1/cron/tick`.
4. Webhooks: WhatsApp URL `/v1/webhooks/whatsapp` (+ app secret), SendGrid events `/v1/webhooks/sendgrid/events` (signed) and inbound parse `/v1/webhooks/email/inbound?token=WEBHOOK_SHARED_SECRET`, Cal.com `/v1/webhooks/calendar/booked`, Twilio `/v1/voice/incoming?businessId=…`, Stripe `/v1/webhooks/stripe`.
5. hPanel: enable **Force HTTPS**, keep automatic backups on, restrict phpMyAdmin/remote MySQL access, enable the free **Hostinger/Cloudflare** protection if available (optional — the app does not require any CDN/WAF; if you add Cloudflare, keep `TRUST_PROXY=true`).
6. Re-run the Hostinger vulnerability scan after redeploy and keep the e-mail for evidence.

## Hostinger-specific limits
Shared hosting: no root, no custom WAF rules, no process isolation guarantees, OS patching is Hostinger's. The in-process limiter is per Node process. Hostinger's scanner reads `package-lock.json`; it can only show the fixed state after the new lockfile is deployed. Passing local tests does **not** prove the hosted environment is secure.
