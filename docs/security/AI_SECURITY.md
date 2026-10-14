# AI / Agent Security

Mapped to OWASP Top 10 for LLM Applications.

| Risk | Control | Status |
|---|---|---|
| LLM01 Prompt injection (inbound email/WhatsApp, scraped websites) | inbound text is data, not instructions; agents only have registry tools; high-impact actions go to the approvals queue | [I] — behavioural, not provable by unit tests |
| LLM02 Insecure output handling | model output rendered as text in React (escaped); TwiML values XML-escaped; no `eval`/shell from output | [T] for TwiML escape |
| LLM04 Model DoS / cost abuse | plan quotas (`consumeQuota`), FREE plan is BYOK-only, per-route rate limits | [I] |
| LLM06 Excessive agency | tools cannot reach arbitrary DB queries or shell; every tool call executes with tenant context; sends/contracts need human approval | [I] |
| LLM07 System prompt / data leakage | no secrets in prompts; provider errors are redacted of all chain keys (tested in `llm.test.ts`) | [T] |
| LLM08 Vector/embedding weakness | knowledge base queries are business-scoped | [I] |
| LLM10 Model theft / key theft | BYOK keys AES-256-GCM encrypted, never returned (last 4 only), custom base URLs pass SSRF guard | [T] |

Rules for new tools: (1) validate arguments with zod, (2) call `requireBusiness`-equivalent scoping, (3) classify as read / reversible write / high-impact; high-impact must create an approval, (4) never expose raw SQL, filesystem or command execution.
Self-hosted model endpoints on private addresses are blocked unless `ALLOW_PRIVATE_AI_URLS=true` (self-hosting only).
