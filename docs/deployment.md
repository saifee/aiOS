# Deployment

## Docker Compose (single VM)
1. `cp .env.example .env` and fill keys (minimum: ANTHROPIC_API_KEY, SENDGRID_API_KEY, DATABASE_URL auto-wired).
2. `docker compose up -d --build`
3. Run once: `docker compose exec api npx prisma migrate deploy && docker compose exec api npm -w packages/db run seed`

## Kubernetes
- Build & push images (CI job included): api, workers, ai, web.
- `kubectl create secret generic leadhunter-env --from-env-file=.env`
- `kubectl apply -f infra/k8s/deployment.yaml`
- Use managed Postgres (RDS/Cloud SQL) + Redis (Elasticache/Memorystore).

## Provider setup checklist
- SendGrid: API key, Event Webhook → /v1/webhooks/sendgrid/events, Inbound Parse → /v1/webhooks/email/inbound, domain authentication (SPF/DKIM/DMARC).
- WhatsApp Cloud: Meta app, phone number ID, permanent token, webhook → /v1/webhooks/whatsapp with WHATSAPP_VERIFY_TOKEN, approve an `intro_outreach` template per language.
- Google: Places API + Programmable Search keys.
- Hunter / Apollo: API keys for contact enrichment.
- Cal.com: API key + booking webhook → /v1/webhooks/calendar/booked.
- Slack/Telegram bots for owner alerts.
