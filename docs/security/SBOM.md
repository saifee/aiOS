# Software Bill of Materials

- Format: **CycloneDX JSON**. File: `docs/security/sbom.cdx.json` — production dependencies only (254 components) generated 2026-10-13 with `@cyclonedx/cyclonedx-npm`.
- Regenerate: `npm run sbom`. CI also publishes a fresh SBOM artefact (90-day retention) on every `Security` workflow run.
- Not included: OS packages of the Hostinger host, the optional Python service (generate with `cyclonedx-py` if you deploy it), container base images.
- Use: feed to Dependency-Track/OSV/Grype for continuous matching; attach to customer security questionnaires.
