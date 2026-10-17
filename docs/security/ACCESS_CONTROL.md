# Access Control

Roles per tenant (`Membership.role`): OWNER, ADMIN, MEMBER, VIEWER. The role is read from the database (cached ≤ 60 s) on every request — the role claim inside the token is ignored.

| Capability | OWNER | ADMIN | MEMBER | VIEWER |
|---|---|---|---|---|
| Read tenant data | ✓ | ✓ | ✓ | ✓ |
| Manage integration credentials | ✓ | ✓ | – | – |
| See configuration warnings (`/me.securityWarnings`) | ✓ | ✓ | – | – |
| Own BYOK keys, prefs, notifications | own only | own only | own only | own only |

Notes: VIEWER is enforced read-only centrally in `authenticate` (any non-GET request is 403 except own preferences/notifications; tested). MEMBER-vs-ADMIN distinctions beyond integration credentials are not yet fine-grained — only the integrations route uses `requireRole` today (R-07). Registration creates a new tenant with the registrant as OWNER; there is no invitation/role-assignment API yet, so cross-tenant privilege escalation by role editing is not possible. Passwords: ≥ 10 characters, scrypt (N=16384). Sessions: 24 h JWT (`JWT_EXPIRES_IN`), removed members rejected within 60 s. MFA: [P].


## Platform superadmin (added with the admin console)

Workspace roles (OWNER/ADMIN/MEMBER/VIEWER) never reach outside their own workspace. A separate **platform superadmin** can see every user, view and allocate subscriptions, record manual payments and configure payment methods.

- Designation: accounts listed in `SUPERADMIN_EMAILS`; if that variable is empty, the first account ever created.
- Enforcement: every `/v1/admin/*` route runs `authenticate` and then `requireSuperAdmin` on each request (no cached decision). Workspace owners get 403.
- Audit: plan changes, payments and payment-method changes write an `AuditLog` row for the affected workspace.
- Secrets: Stripe keys saved from Settings are AES-256-GCM encrypted with `ENCRYPTION_KEY`, are write-only in the UI/API (only the last four characters are returned), and are refused when `ENCRYPTION_KEY` is missing.
- Tests: `apps/api/src/__tests__/admin.test.ts` covers anonymous access, normal-owner denial on every admin route, env override, validation, and secret non-disclosure.
- Residual risk: a superadmin account is high value. Use a long unique password and restrict `SUPERADMIN_EMAILS` to one or two people. MFA is not implemented yet (see R-03).
