# API Reference (v1)

Auth: `Authorization: Bearer <jwt>` — obtain via /v1/auth/login.

## Auth
- POST /v1/auth/register { email, password, name, tenantName }
- POST /v1/auth/login { email, password }

## Businesses
- GET  /v1/businesses
- POST /v1/businesses  (full profile: services, industries, geo, keywords, caps, hours, languages, tone, calendarLink, minLeadScore)
- GET  /v1/businesses/:id
- PATCH /v1/businesses/:id

## Campaigns
- GET/POST /v1/businesses/:businessId/campaigns  { name, channels[], sources[], followUpDays[], maxFollowUps }
- PATCH /v1/campaigns/:id/status { status }

## Leads
- GET /v1/businesses/:businessId/leads?stage=&minScore=&search=&take=&cursor=
- GET /v1/leads/:id  (contacts, activities, messages, meetings, conversations)
- PATCH /v1/leads/:id/stage { stage }
- POST /v1/leads/:id/enrich | /qualify | /outreach | /opt-out

## Conversations
- GET /v1/businesses/:businessId/conversations
- POST /v1/conversations/:id/handoff
- POST /v1/conversations/:id/reply { body }

## Analytics
- GET /v1/businesses/:businessId/analytics/overview → leadsToday, sent, openRate, replyRate, positiveReplies, meetingsBooked, dealsWon, conversionRate, pipeline[], heatmap[], industries[], suggestions[]

## Integrations
- GET /v1/businesses/:businessId/integrations
- PUT /v1/businesses/:businessId/integrations/:provider { credentials, config } (credentials AES-256-GCM encrypted)

## Webhooks (provider-authenticated)
- GET/POST /v1/webhooks/whatsapp (Meta verify + inbound + statuses)
- POST /v1/webhooks/sendgrid/events (opens, bounces, spam → suppression)
- POST /v1/webhooks/email/inbound (replies)
- POST /v1/webhooks/calendar/booked
