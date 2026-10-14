# Access Control

Roles per tenant (`Membership.role`): OWNER, ADMIN, MEMBER, VIEWER. The role is read from the database (cached ≤ 60 s) on every request — the role claim inside the token is ignored.

| Capability | OWNER | ADMIN | MEMBER | VIEWER |
|---|---|---|---|---|
| Read tenant data | ✓ | ✓ | ✓ | ✓ |
| Manage integration credentials | ✓ | ✓ | – | – |
| See configuration warnings (`/me.securityWarnings`) | ✓ | ✓ | – | – |
| Own BYOK keys, prefs, notifications | own only | own only | own only | own only |

Notes: VIEWER is enforced read-only centrally in `authenticate` (any non-GET request is 403 except own preferences/notifications; tested). MEMBER-vs-ADMIN distinctions beyond integration credentials are not yet fine-grained — only the integrations route uses `requireRole` today (R-07). Registration creates a new tenant with the registrant as OWNER; there is no invitation/role-assignment API yet, so cross-tenant privilege escalation by role editing is not possible. Passwords: ≥ 10 characters, scrypt (N=16384). Sessions: 24 h JWT (`JWT_EXPIRES_IN`), removed members rejected within 60 s. MFA: [P].
