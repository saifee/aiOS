# Multi-Tenant Security

**Model:** shared database, shared schema; every tenant-owned row is reachable via `tenantId` directly or through `businessId → Business.tenantId`.

**Rules for every route**
1. Authenticate (`app.authenticate`) — the tenant comes from the verified token + live membership, never from the request body.
2. Business-scoped routes call `requireBusiness(req, businessId)` (404, not 403, on mismatch to avoid enumeration).
3. By-ID routes put ownership in the `WHERE` (`findFirst({ id, business: { tenantId } })` / `updateMany({ id, userId })`) rather than fetch-then-check.
4. Webhook handlers are unauthenticated by user, so they must be authenticated by provider signature and must not trust IDs in the payload without it.
5. AI context (`withLlmContext`, `AsyncLocalStorage`) carries the tenant so keys, plan limits and tools cannot cross tenants.

**Negative tests present:** notification IDOR, cross-tenant business access, removed member, DB-sourced role, unsigned calendar webhook that would otherwise tamper with any lead, mass-assignment on registration.
**Known gaps:** not every by-ID route has its own negative test (R-07); no DB-level isolation; exports/reports are scoped by `businessId` and rely on rule 2.
