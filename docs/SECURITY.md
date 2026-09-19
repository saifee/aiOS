# Security posture (dependency audit)

Response to the 74-item scan. Summary: the alarming items are not reachable in
this deployment; the reachable ones need a Fastify 5 major upgrade (deliberate,
tested — not a blind bump).

## Fixed now (safe, no breaking changes)
- next 14.2.5 → 14.2.35 — clears the Next cluster including the middleware auth
  bypass (CVE-2025-29927) and the DoS/cache CVEs patched in the 14.2.x line.
- Removed @fastify/static entirely (path-traversal CVEs, no v7 patch existed).
  The frontend is now served by a small traversal-safe handler in server.ts that
  verifies every resolved path stays inside the frontend directory.

## Not reachable in this deployment (no action needed now)
- Next AVIF RCE + image-optimization CVEs: the app is a STATIC EXPORT with
  images.unoptimized = true. The image optimizer, Server Actions, middleware,
  and custom SSR server do not run, so these CVEs have no exploit path here.
- fast-jwt "Critical" (empty-HMAC bypass / RSA-HMAC confusion): requires an empty
  secret or RSA public-key config. The app uses a required HMAC secret — not this config.

## Dev-only (build/test tooling, not in the running server)
vitest, vite, esbuild, postcss, browserslist, nanoid, baseline-browser-mapping,
launch-editor. These never execute in production.

## Reachable, but require the Fastify 4 → 5 upgrade (recommended, do with testing)
Fastify 4.29.1 is the last 4.x — there is NO in-major patch. Fixing the fastify
core (Content-Type validation bypass, X-Forwarded spoof), fast-uri (SSRF/host
confusion), and find-my-way (HTTP/2 DoS) advisories means upgrading:
  fastify ^5.12, @fastify/jwt ^10 (pulls patched fast-jwt), @fastify/cors ^10,
  @fastify/rate-limit ^10, @fastify/multipart ^9, fastify-plugin ^5, fastify-raw-body (v5-compatible)
This has breaking API changes and must be tested (locally or on a VPS), not
pushed blind onto a working shared-hosting deploy.

## Do NOT run `npm audit fix --force`
It pulls Next 15 and Fastify 5 automatically and will break the build.
