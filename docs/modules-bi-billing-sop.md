# Intelligence, Billing & SOP Engine

## Business Intelligence (`/bi`)
Live metrics from the system of record — no manual entry:
revenue (MTD, all-time, 6-month trend), cash position + runway, weighted
pipeline value & expected revenue, receivables/overdue, conversion rate,
avg deal size, project health, task status, AI utilization, and a
call-sentiment satisfaction proxy. Endpoint: `GET /v1/businesses/:id/bi/overview`.
Where a source isn't tracked yet (e.g. granular expenses), it degrades to a
labeled estimate rather than a fake number.

## Billing (`/billing`, Stripe)
Plans TRIAL/STARTER/GROWTH/SCALE/ENTERPRISE with per-plan limits (leads,
outreach, calls, seats, agents) defined in `packages/integrations/src/billing.ts`.
- `POST /v1/billing/checkout` → Stripe Checkout (subscription)
- `POST /v1/billing/portal` → Stripe customer portal
- `GET /v1/billing/subscription` → current plan + usage meters
- `POST /v1/webhooks/stripe` → keeps Subscription + tenant.plan in sync (signature-verified)
Enforce limits before consuming quota with `consumeQuota(tenantId, metric)`
(`apps/api/src/lib/limits.ts`). Set `STRIPE_PRICE_*` env vars to your Stripe prices.

## SOP Engine (`/sops`)
Capture a process and make it repeatable — or automatable.
- Taught: describe a process in plain language → structured SOP (ordered steps, owners, tools).
- Observed: `generate` with `fromActivity` synthesizes an SOP from the recent audit log.
- Activate as automation: if one AI agent can run it end-to-end, the SOP carries an `automation { role, input }`; **Run now** executes it through the agent kernel (respecting the human-approval gate).
Endpoints under `/v1/businesses/:id/sops` and `/v1/sops/:id/{activate,run}`. Generation lives in the AI service: `POST /sop/generate`.
