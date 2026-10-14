# Security Testing

## Automated (run on every push — `npm run test`)
`apps/api/src/__tests__/security.test.ts` (31 tests, Fastify `inject` with an in-memory Prisma double) and `packages/integrations/src/__tests__/netguard.test.ts` (27 tests).

Covered: missing/removed-member/alg=none/HS512 tokens → 401 · notification IDOR → 404 and query scoped by `userId` · cross-tenant business → 404 · role taken from DB (VIEWER cannot write credentials) · integration response never echoes credentials, unknown provider and extra fields → 400 · WhatsApp/SendGrid/Cal.com/inbound-email/Stripe/Twilio unsigned → rejected, correctly signed → accepted · calendar webhook cannot create meetings without secret · security headers & CSP · CORS does not reflect arbitrary origins · 5xx hides internals · JWT secret policy · registration mass-assignment, duplicates, email normalisation · login same body for unknown user vs wrong password · setup token and production error hiding · SSRF (loopback, private ranges, metadata IP, IPv6-mapped, schemes, credentials) · encryption refuses zero/missing key, tamper detection.

## Not run in the build sandbox (be explicit)
- Tests against a real MySQL/MariaDB with the Prisma engine (engine download blocked): DB-level behaviour is covered by mocks only. **[B]**
- CodeQL, Semgrep, gitleaks, OSV-scanner, ZAP: defined in CI, executed only on GitHub. A hand-rolled regex secret scan and `npm audit` / `pip-audit` were run locally. **[B]**
- No penetration test or DAST was performed.

## How to run locally
`npm ci && npm -w packages/db run generate && npm run test && npm run audit:all`
