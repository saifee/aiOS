# Architecture

## Services
| Service | Tech | Responsibility |
|---|---|---|
| web | Next.js 14 | Dashboard, CRM UI, onboarding |
| api | Fastify + Prisma | REST API, auth (JWT), tenant isolation, webhooks |
| workers | BullMQ | The autonomous agent: 8 queues + 3 cron loops |
| ai | FastAPI + Claude | Scoring, generation, conversation intelligence |
| postgres | 16 | System of record |
| redis | 7 | Queues, rate limits |
| elasticsearch | 8 | (optional) lead search at scale |
| minio/S3 | — | Attachments, exports |

## Queue topology
discovery → enrichment → qualification → outreach → followup
                                      ↘ conversation (on inbound) → notify
learning (nightly cron)

Retries: BullMQ default exponential backoff; outreach jobs self-delay when the
daily cap or working-hours gate blocks them, so nothing is lost.

## Multi-tenancy
JWT carries { userId, tenantId, role }. Every business-scoped route calls
requireBusiness(businessId) which verifies tenant ownership. All queries filter
by businessId; Lead has a compound unique (businessId, dedupeKey).

## Scaling
- api and workers are stateless → horizontal replicas (k8s manifests included)
- per-queue concurrency tunable; discovery is I/O bound, outreach deliberately throttled
- AI service scales independently; responses cached upstream where possible
