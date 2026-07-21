# Integrations Catalog

| Category | Providers wired | Notes |
|---|---|---|
| Email sending | SendGrid (primary), AWS SES (fallback) | open tracking, event webhook, inbound parse |
| WhatsApp | Meta WhatsApp Business Cloud API | approved templates + 24h session messages |
| Discovery | Google Places, Google Programmable Search, SerpAPI | directories, tenders, job posts, news queries |
| Enrichment | Hunter.io, Apollo.io, Clearbit (slot) | verified emails, titles, company size, tech stack |
| Calendar | Cal.com API (+ webhook), booking-link flow works with Calendly/Google | meetings auto-logged |
| Owner alerts | Email, Slack, Telegram, FCM (slot) | only for genuine opportunities |
| Billing | Stripe (env slots + tenant.stripeCustomerId) | plans: TRIAL/STARTER/GROWTH/SCALE/ENTERPRISE |
| AI | Anthropic Claude (primary), OpenAI/Gemini (env slots) | scoring, generation, conversation |

Add a provider: implement a client in packages/integrations, store credentials via PUT /integrations/:provider (encrypted), reference it in the relevant worker.
