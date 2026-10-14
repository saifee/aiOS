# aiOS Security Overview

Status labels used in every document: **[T]** implemented and covered by automated tests · **[I]** implemented, not fully tested (reason given) · **[P]** planned · **[N/A]** not applicable · **[B]** blocked (reason given).

This is an engineering record of controls, not a certification. aiOS has **not** been audited against SOC 2, ISO 27001, PCI DSS or any privacy law; the standards mapping (`SECURITY_STANDARDS_MAPPING.md`) shows which engineering controls line up with which requirements.

## Architecture in one paragraph
One Node.js process (Fastify 5) serves the JSON API (`/v1/*`) and the static Next.js frontend; background jobs run inline (no Redis) and a cron endpoint ticks them. Data lives in MySQL/MariaDB through Prisma. AI calls go to providers using per-user keys (BYOK, AES-256-GCM encrypted at rest) with platform keys as fallback on paid plans. Optional Python AI service and voice bridge exist for Docker deployments only.

## Trust boundaries
1. Browser ⇄ API (Bearer JWT in `Authorization`; no cookies, so no CSRF surface).
2. Internet ⇄ webhook endpoints (WhatsApp, SendGrid, Twilio, Stripe, Cal.com) — authenticated by provider signature or shared secret, never by user JWT.
3. API ⇄ database (tenant scoping enforced in route queries).
4. API ⇄ third-party AI/provider APIs (outbound; user-supplied URLs pass the SSRF guard).
5. Tenant ⇄ tenant (the main isolation boundary; see `MULTI_TENANT_SECURITY.md`).

## Control summary
| Area | Control | Status |
|---|---|---|
| Authn | scrypt hashing, HS256-only JWT, 24 h expiry, live membership re-check (60 s cache), login timing equalisation, 10/min rate limit | [T] |
| Authz | tenant-scoped queries, `requireBusiness`, role from DB, admin-only integration credentials | [T] |
| Input | zod validation, `.strict()` on registration (mass-assignment), body limit 1 MB | [T] |
| Webhooks | signature/secret required, fail-closed | [T] (Twilio route-level [T]; Stripe signature logic is the Stripe SDK) |
| Transport/headers | HSTS (prod), CSP, nosniff, frame deny, referrer/permissions policy, `no-store` on API | [T] |
| CORS | allow-list (`APP_URL` + `CORS_ORIGINS`), no credentials | [T] |
| Secrets | no zero-key crypto fallback, startup refusal on weak JWT secret, log redaction, `.gitignore` rules | [T]/[I] |
| SSRF | DNS-resolving private-range guard for custom AI URLs and lead-website fetches | [T] (DNS rebinding residual: see risk register) |
| Errors | central handler; 5xx never leak internals | [T] |
| Supply chain | 0 known advisories (npm + pip) at release, Dependabot, CI audit gate, SBOM | [I] CI gates not executed outside GitHub |
| AI | tool calls run inside tenant context; approvals for high-impact actions; BYOK isolation | [I] see `AI_SECURITY.md` |
