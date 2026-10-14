# Dependency Management

- Lockfile (`package-lock.json`) is committed and authoritative. CI uses `npm ci`. Never delete it to "fix" problems.
- **Forbidden:** `npm audit fix --force`, `--legacy-peer-deps` without review, adding packages only to satisfy a scanner, pinning to unreviewed forks.
- Upgrades go through Dependabot PRs (weekly, minor/patch grouped). Major upgrades are manual with a changelog read and the full test run.
- New dependency checklist: maintained? downloads/age? install scripts? licence? needed at all (prefer Node built-ins — e.g. password hashing uses `crypto.scrypt`, static serving is hand-written)?
- Build-time vs runtime: `npm audit --omit=dev` is the production gate; `npm audit` (all) is also gated in CI because dev tooling runs on developer machines and CI.
- Registry signatures: `npm audit signatures` in CI.
- Node runtime: use Node 22 LTS on Hostinger (Fastify 5 / Next 16 need ≥ 20.9; repo declares ≥ 20.19).
- Python service (`services/ai`) pins exact versions; `pip-audit` in CI.

Major upgrades performed in this hardening pass: Fastify 4→5 (+ cors 11, jwt 10, rate-limit 11, multipart 10), Next 14→16, React 18→19, Tailwind 3→4, vitest 1→5, recharts 2→3, lucide-react 0.x→1.x, FastAPI 0.111→0.143.
