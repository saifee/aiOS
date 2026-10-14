# Threat Model (STRIDE, abridged)

Assets: tenant business data (leads, conversations, calls), stored provider credentials and BYOK AI keys, user accounts, platform AI spend, availability.
Actors: anonymous internet user, authenticated user of another tenant, malicious tenant user, compromised third-party provider/webhook sender, malicious lead content (inbound email/WhatsApp text fed to LLMs), insider with hosting access.

| # | Threat (STRIDE) | Entry point | Mitigation | Residual |
|---|---|---|---|---|
| T1 | Spoofing: forge JWT | `Authorization` | HS256-only, ≥32-char secret enforced at boot, alg=none/HS512 rejected (tested) | secret leakage → rotate (INCIDENT_RESPONSE) |
| T2 | Spoofing: fake webhook | `/v1/webhooks/*`, `/v1/voice/*` | signature/secret required, fail closed (tested) | shared-secret providers (SendGrid Inbound Parse) rely on URL secrecy |
| T3 | Tampering/EoP: BOLA on object IDs | any `:id` route | ownership in WHERE; notification IDOR fixed (tested); `requireBusiness` | routes not individually negative-tested: tracked R-07 |
| T4 | Tampering: mass assignment | register/setup/integrations | zod `.strict()` (tested) | other routes use explicit field picks; review each new route |
| T5 | Info disclosure: error detail, DB errors, credentials echo | 5xx, `/setup/status`, integrations PUT | central error handler, prod detail hidden, no credential echo (tested) | — |
| T6 | Info disclosure: cross-tenant data | all queries | tenant filters; DB role check | no DB-level row security (MySQL) — R-07 |
| T7 | SSRF via custom AI URL / website enrichment | `/ai/keys`, enrichment worker | DNS + range check, manual redirect re-check (tested) | DNS rebinding TOCTOU — R-05 |
| T8 | Repudiation | privileged actions | structured logs | no immutable audit trail — R-09 |
| T9 | DoS | login, webhooks, AI endpoints | global 300/min + per-route limits; 1 MB body | in-memory limiter is per process; shared host limits apply |
| T10 | Prompt injection through inbound messages → tool misuse | conversation agent | tools execute in tenant context, approvals for high-impact actions, no raw DB/shell tool | LLM behaviour is probabilistic — R-06 |
| T11 | Credential stuffing | `/auth/login` | 10/min/IP, equalised timing | no lockout/MFA — R-03 |
| T12 | Supply-chain compromise | npm/pip | lockfile, `npm ci`, audit gate, Dependabot, `npm audit signatures` | transitive zero-days |
| T13 | Secret leakage in repo/logs | git, logs | `.gitignore`, gitleaks, log redaction | previously pasted credentials must be rotated (see report) |
