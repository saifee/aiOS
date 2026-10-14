# Privacy & Data Protection (engineering view — not legal advice)

**Data processed:** account data (name, e-mail, password hash), lead/contact data (names, e-mail, phone, WhatsApp), message and call content, uploaded knowledge, AI usage metrics, BYOK keys. Lead data is personal data about third parties; the tenant is the controller and aiOS the processor — a DPA and lawful-basis review are the operator's responsibility.

**Controls:** data minimisation in logs (redaction); encryption of credentials at rest; TLS via host; opt-out keyword handling and suppression lists stop further outreach (existing); `no-store` on API responses; per-tenant isolation; AI prompts include only the business context needed for the task.

**Data subject rights (access/erasure/portability):** not yet exposed as self-service. Deleting a tenant/user cascades through the schema (`onDelete: Cascade`); an export endpoint [P]. **Retention:** no automatic retention schedule yet [P]. **Cross-border:** content is sent to the AI providers the user chooses (BYOK) — disclose this to end customers. **Breach handling:** `INCIDENT_RESPONSE.md`.

Design status: privacy-by-design basics [I]; no DPIA, ROPA or certification exists.
