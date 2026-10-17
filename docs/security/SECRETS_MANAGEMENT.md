# Secrets Management

## Rules
1. Real secrets live only in the hosting panel's environment variables (Hostinger hPanel → Node.js → Environment variables). Never in git, tickets, chat or screenshots.
2. Templates (`.env.example`, `.env.render`, `.env.docker`) contain placeholders only. `.gitignore` excludes `.env`, `.env.*` (except those templates), keys and certificates. CI runs gitleaks over the full history.
3. Generate with `openssl rand -hex 32`. `JWT_SECRET` ≥ 32 chars (production refuses to boot otherwise). `ENCRYPTION_KEY` = exactly 64 hex chars, not all zeros (encryption throws otherwise — there is no silent default).
4. Logs redact `Authorization`, cookies, `x-cron-key`, `x-webhook-secret`, `x-setup-token` and `?key=` / `?token=` query values.
5. User BYOK AI keys and integration credentials are AES-256-GCM encrypted at rest; only the last 4 characters are shown in the UI.

## Inventory
| Secret | Purpose | Rotation impact |
|---|---|---|
| `JWT_SECRET` | signs session tokens | all users must sign in again |
| `ENCRYPTION_KEY` | encrypts BYOK keys & integration credentials | **stored keys become unreadable** — users must re-enter them; plan a re-encrypt migration before rotating |
| `DATABASE_URL` password | DB access | change in hPanel then env, restart |
| `CRON_SECRET`, `SETUP_TOKEN`, `WEBHOOK_SHARED_SECRET` | endpoint guards | update the cron/webhook URLs too |
| `WHATSAPP_APP_SECRET`, `TWILIO_AUTH_TOKEN`, `SENDGRID_WEBHOOK_PUBLIC_KEY`, `CALCOM_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET` | webhook authenticity | rotate at the provider, then env |
| Provider API keys | outbound services | rotate at provider |

## Exposure response
Secrets pasted into chat/e-mail/screenshots are considered exposed: rotate them (R-01). Details in `INCIDENT_RESPONSE.md`.
