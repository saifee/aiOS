# Compliance & Responsible Outreach

LeadHunter is built to keep tenants inside email/messaging law and platform policy:

1. **Consent & opt-out**: every email carries a working unsubscribe link and List-Unsubscribe header. STOP/unsubscribe keywords (English + Arabic) on any channel immediately archive the lead and write email+phone to the global suppression list. Suppression is checked before *every* send.
2. **Deliverability hygiene**: bounces and spam complaints auto-suppress. Daily per-business caps and working-hours windows prevent burst sending.
3. **WhatsApp policy**: business-initiated messages use Meta-approved templates only; free-form replies only inside the 24-hour customer-service window.
4. **Truthful AI**: generation prompts hard-forbid invented facts, false urgency, and misleading subjects; the conversation agent answers only from configured business facts and escalates rather than guesses. Pricing follows the tenant's pricingPolicy.
5. **Data sourcing**: company data from public/official APIs (Google Places, programmable search); person data from licensed providers (Hunter, Apollo). No LinkedIn scraping (ToS).
6. **Security**: JWT auth, strict tenant isolation on every route, AES-256-GCM for integration credentials, full audit log.
7. **Jurisdictions**: defaults align with CAN-SPAM/GDPR-style requirements; tenants remain responsible for local rules (e.g., UAE/KSA telecom regulations) — configure caps, hours, and channels accordingly.
