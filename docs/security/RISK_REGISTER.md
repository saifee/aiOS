# Risk Register

Likelihood/Impact: L/M/H. Owner for all items: Founder / Head of IT. Review each release.

| ID | Risk | L | I | Status | Treatment | Target |
|---|---|---|---|---|---|---|
| R-01 | Previously shared credentials (DB password, Supabase keys) still valid | H | H | **Open — action by owner** | Rotate DB password & any exposed keys; confirm old ones revoked | immediately |
| R-02 | Weak/short `JWT_SECRET` or `ENCRYPTION_KEY` in hPanel env | M | H | Mitigated in code (app refuses to boot / warns owners); verify values | at deploy |
| R-03 | No MFA / account lockout | M | M | Open [P] | add TOTP + lockout counter | next milestone |
| R-04 | CSP allows `'unsafe-inline'` scripts (Next static export) | M | M | Accepted/documented | move to nonce-based CSP if frontend becomes SSR | backlog |
| R-05 | DNS rebinding between SSRF check and connect | L | M | Open | egress filtering at host/network; pin resolved IP in a custom dispatcher | backlog |
| R-06 | LLM prompt injection / excessive agency | M | H | Partially mitigated | approvals, tenant-scoped tools, no shell/DB tools; add output filtering + red-team tests | next milestone |
| R-07 | Tenant isolation relies on app-layer filters only; not every route has a negative test | M | H | Partially mitigated | extend negative tests per route; add lint rule/review checklist | next milestone |
| R-08 | Hostinger shared hosting: no WAF/IDS under our control, patching of OS by host | M | M | Accepted | enable Cloudflare (optional), keep app deps patched | ongoing |
| R-09 | No immutable audit log of privileged actions | M | M | Open [P] | add `AuditLog` table + writes for auth/integration/key changes | next milestone |
| R-10 | Voice bridge (Docker profile) WebSocket does not verify Twilio signature | M | M | Open [P] | verify `X-Twilio-Signature` on WS upgrade; not used on Hostinger | before enabling voice |
| R-11 | Backups not automated by the app | M | H | Mitigated by procedure | see `BACKUP_AND_RECOVERY.md`; verify hPanel backups & restore test | at deploy |
| R-12 | In-memory rate limiter resets on restart, per-process | L | L | Accepted | Redis store when available | backlog |
| R-13 | `npm audit` cannot see zero-days / non-npm components | L | M | Accepted | weekly scans, OSV, Dependabot | ongoing |
