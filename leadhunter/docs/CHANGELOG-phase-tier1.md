# Phase: Tier-1 hardening

Closed three "looks-done-but-breaks" gaps + one related billing bug.

1. Stripe limit enforcement — `consumeQuota()` (packages/agents/src/limits.ts,
   check-then-increment so counters never exceed the cap) is now wired into:
   - discovery worker → "leads" (stops inserting when the monthly cap is hit)
   - outreach worker → "outreach" (pauses sends, logs the reason on the lead)
   - voice route → "calls" (plays a polite AR/EN message + hangs up when over)
2. Inbound email — /v1/webhooks/email/inbound now parses SendGrid Inbound Parse
   multipart/form-data (via @fastify/multipart attachFieldsToBody) with an html→text
   fallback; still accepts plain JSON.
3. Growth/BizDev web discovery — new `find_prospects` tool wired to the existing
   discovery engine (Google Places / CSE / SerpAPI); Growth + Business Development
   agents can now actually hunt the web, then create_lead on what they find.
4. (bonus) Stripe webhook signature verification now receives the raw request body
   via fastify-raw-body — previously verification would have failed.

New deps: @fastify/multipart, fastify-raw-body.
