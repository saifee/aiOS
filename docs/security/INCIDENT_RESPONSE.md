# Incident Response (lightweight runbook)

**Severity:** SEV1 data breach / credential compromise · SEV2 exploitable vuln in production · SEV3 suspicious activity.

1. **Detect & triage** (owner: Head of IT): scanner mail, user report, log anomaly (spikes of 401/403/429, unknown webhook rejections).
2. **Contain:** rotate the affected secret (`SECRETS_MANAGEMENT.md`); to invalidate all sessions change `JWT_SECRET`; disable a provider by removing its env var; take the app offline in hPanel if data exfiltration is suspected.
3. **Eradicate:** patch/upgrade, redeploy, re-run `npm run test` and `npm run audit:all`.
4. **Recover:** restore from backup if data was altered (`BACKUP_AND_RECOVERY.md`); verify tenant data integrity.
5. **Notify:** assess legal duties (GDPR 72 h to regulator where applicable; Saudi PDPL breach notification; customer contracts). Legal counsel decides — this document is not legal advice.
6. **Learn:** blameless post-mortem within 5 business days; update `RISK_REGISTER.md` and tests (every incident gets a regression test).

Evidence to preserve: server logs (redacted), `git log`, DB snapshot, scanner reports, timeline.
Contacts to fill in before go-live: security mailbox, hosting support, DPO/legal, key customers.
