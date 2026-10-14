# Secure SDLC

Aligned in intent with NIST SP 800-218 (SSDF). Practices are listed with how this repository supports them.

| Phase | Practice | Where |
|---|---|---|
| Plan | Threat model + risk register reviewed each release | `THREAT_MODEL.md`, `RISK_REGISTER.md` |
| Design | Tenant isolation and webhook authenticity are design rules, not afterthoughts | `MULTI_TENANT_SECURITY.md` |
| Code | Small PRs; validation with zod; no `npm audit fix --force`; no lockfile deletion | `DEPENDENCY_MANAGEMENT.md` |
| Review | Reviewer checklist = `SECURITY_RELEASE_CHECKLIST.md` (auth, tenant scope, secrets, logging) | PR template recommended [P] |
| Test | Negative security tests run on every push (`npm run test`) | `apps/api/src/__tests__/security.test.ts` |
| Scan | Dependency audit (blocking), gitleaks (blocking), CodeQL, Semgrep, OSV, dependency-review on PRs | `.github/workflows/security.yml` |
| Release | SBOM artefact per run; release checklist; tag builds Hostinger package | `.github/workflows/hostinger-package.yml` |
| Operate | Weekly scheduled scan; Dependabot; incident runbook | `INCIDENT_RESPONSE.md` |

Branch protection (require PR review + passing `Security` and `CI` checks, no force-push to `main`) must be enabled in GitHub settings — it cannot be configured from the repository files. [P — manual step]
