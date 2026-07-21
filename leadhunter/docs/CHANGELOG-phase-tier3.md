# Phase: Tier-3 — Dev Swarm, Creative, Social

## Developer swarm (multi-model, real APIs)
`packages/agents/src/swarm.ts` orchestrates a faithful realization of the vision:
- Architect (Claude) → plan + acceptance criteria + test command
- Researcher (Perplexity, optional) → web-grounded answers to open questions
- Coder (Claude) → the changeset
- Reviewer (Gemini) → issues + verdict
- Fixer (OpenAI) → revised changeset
- QA (sandbox) → runs the test command in an isolated temp dir; on failure loops
  back to the Fixer (max 2 retries)
- Delivery → opens a GitHub PR, gated by human approval
Every stage is persisted to SwarmRun.stages. Provider missing a key? It degrades
to Claude for that role instead of failing.
NOTE: "Cursor"/"Copilot" are editors, not headless APIs — their roles are filled
by real callable models (OpenAI as fixer, Gemini as reviewer). This is the honest,
functional equivalent of the requested pipeline.

`models.ts` — provider-agnostic router (Claude/Gemini/OpenAI/Perplexity over REST).
`sandbox.ts` — isolated test runner with timeout. SECURITY: runs model-generated
code; in production execute inside a locked-down container/microVM.
Org integration: project_manager / cto / backend_engineer have a `delegate_build`
tool → dispatches a swarm run (async worker). Approving the PR from the Command
Center calls `deliverApprovedPR` → commits + opens the PR via GitHub API.

## Creative hands (real generation)
- Image: OpenAI gpt-image-1 (`generate_image` tool → Graphic Designer). Real.
- Video: HeyGen avatar video (`generate_video` → Video Creator); submits a job,
  poll via /media/:id/refresh. Needs HEYGEN_API_KEY.
Assets stored as MediaAsset (images inline as data URLs for MVP; production should
push to the S3/MinIO bucket already in compose).

## Social publishing (real API clients)
`social.ts` — LinkedIn, Facebook Page, Instagram, X clients + channel dispatcher.
`draft_post` tool → Marketing agent. Publish now via /social/:id/publish or on a
schedule via the social worker cron (*/5 min). Tokens stored per-business as
encrypted Integrations (crypto centralized in @leadhunter/integrations).

## New surfaces
API: /v1 swarm (run/list/get), media (list/image/refresh), social (list/create/publish).
Workers: swarm, social (+ cron). Frontend: /studio (Dev Swarm · Creative · Social).

Verified here: integrations typecheck PASS; 6 TS + 5 Python tests pass; all 37
models resolve; all 13 new TS files parse clean under esbuild. Live provider calls
need your keys and can't be exercised in the build sandbox.
