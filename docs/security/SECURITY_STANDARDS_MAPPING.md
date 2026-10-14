# Standards → Controls Mapping

"Mapped" means an engineering control exists that addresses the topic. It is **not** a claim of compliance or certification.

| Standard / item | Topic | aiOS control | Status |
|---|---|---|---|
| OWASP Top 10 A01 Broken Access Control | IDOR/BOLA, tenant isolation | owner-scoped queries, `requireBusiness`, DB-sourced role, tests | [T] |
| A02 Cryptographic Failures | secrets at rest, key handling | AES-256-GCM, no zero-key fallback, scrypt, HSTS | [T] |
| A03 Injection | SQL/XML/prompt | Prisma parameterised queries; zod; TwiML XML-escape | [T] (prompt injection: [I]) |
| A04 Insecure Design | threat model | `THREAT_MODEL.md` | [I] |
| A05 Security Misconfiguration | headers, CORS, defaults | central config, startup warnings, no default DB passwords in compose | [T] |
| A06 Vulnerable Components | dependencies | audit gate, Dependabot, SBOM | [I] |
| A07 Identification & Auth Failures | login, tokens | rate limits, timing equalisation, 10-char minimum, 24 h JWT | [T]; MFA [P] |
| A08 Software & Data Integrity | webhooks, CI | signature verification, lockfile, `npm audit signatures` in CI | [T]/[I] |
| A09 Logging & Monitoring | logs | redacted structured logs | [I]; audit-log table [P] |
| A10 SSRF | outbound fetch | `netguard.ts` | [T] |
| OWASP API Top 10 (2023) API1 BOLA, API2 Auth, API3 BOPLA (mass assignment), API4 Resource consumption, API5 BFLA, API7 SSRF, API8 Misconfig, API10 Unsafe consumption | | `.strict()` schemas, rate limits, role checks, SSRF guard | [T] except API4 partial [I] |
| OWASP ASVS 4/5 (L1 target, selected L2) | V2 auth, V3 session, V4 access, V5 validation, V7 errors/logging, V8 data protection, V9 comms, V13 API | see rows above | L1 largely met [I]; no formal ASVS assessment performed |
| OWASP SAMM | Governance/Design/Implementation/Verification/Operations | SDLC doc, threat model, CI gates, release checklist | self-assessed maturity ≈ level 1 [I] |
| OWASP LLM Top 10 | LLM01 prompt injection, LLM02 insecure output, LLM06 excessive agency, LLM08/10 | approvals, tenant-scoped tools, no raw DB/shell tools | [I] see `AI_SECURITY.md` |
| NIST SSDF (SP 800-218) | PO/PS/PW/RV | `SECURE_SDLC.md` | [I] |
| NIST CSF 2.0 | Govern/Identify/Protect/Detect/Respond/Recover | risk register; controls; weekly scans; `INCIDENT_RESPONSE.md`; `BACKUP_AND_RECOVERY.md` | partial [I]; Detect (alerting) [P] |
| ISO/IEC 27001:2022 Annex A / 27002 | A.5.15 access control, A.5.23 cloud, A.8.2 privileged access, A.8.8 vuln mgmt, A.8.9 config, A.8.12 DLP/log redaction, A.8.15 logging, A.8.24 cryptography, A.8.25–8.28 secure dev, A.8.29 testing | documents + controls above | engineering alignment only; no ISMS, no audit |
| SBOM (CycloneDX 1.x) | component inventory | `docs/security/sbom.cdx.json` (254 prod components) + CI artefact | [T] generated |
| SLSA | build provenance | lockfile + `npm audit signatures`; no signed provenance | Level 0–1 [P] |
| GDPR / Saudi PDPL (and similar) | lawful basis, minimisation, rights, breach notice | `PRIVACY_AND_DATA_PROTECTION.md` | design support only; legal review required |
| PCI DSS | card data | Stripe-hosted checkout; aiOS stores no card data | [N/A] for SAQ-A style use, merchant must self-assess |
