# Security Release Checklist

- [ ] `npm ci` clean; lockfile committed; no `--force` used
- [ ] `npm run audit:prod` and `npm run audit:all` → 0 high/critical; `pip-audit` clean if the Python service is deployed
- [ ] `npm run typecheck` and `npm run test` green (incl. `security.test.ts`)
- [ ] CI `Security` workflow green: gitleaks, CodeQL, Semgrep, OSV, dependency-review
- [ ] No new route without: authentication, tenant scoping, zod validation, rate limit consideration, negative test
- [ ] No new outbound fetch of a user-supplied URL without `assertPublicUrl`/`safeFetch`
- [ ] No secrets in diff; `.env*` templates placeholders only
- [ ] `docs/security/` updated (risk register, tracker, SBOM regenerated with `npm run sbom`)
- [ ] Production env: strong `JWT_SECRET`, real `ENCRYPTION_KEY`, `APP_URL`, `TRUST_PROXY`, webhook secrets set; `SETUP_TOKEN` removed after setup
- [ ] Backups verified; rollback package available
- [ ] After deploy: `/health` OK, login works, headers present (`curl -I`), Hostinger scan re-run
