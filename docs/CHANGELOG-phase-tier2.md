# Phase: Tier-2

4. Expense tracking → real financials. New `Expense` model + `record_expense`
   tool (Finance agent) + `/v1/businesses/:id/expenses` endpoints + "Log expense"
   on the BI page. BI now computes REAL profit (MTD), monthly burn (trailing
   3-month avg), and cash runway from actual expenses. When no expenses are
   logged, profit/runway honestly show "—" instead of a fabricated estimate.
5. Receptionist. `transfer_call` now actually dials a human via Twilio live-call
   redirect (`redirectCallToHuman`), using the business transfer number or
   DEFAULT_TRANSFER_NUMBER; falls back to taking a message if unset or on error.
   Detected call `language` is now persisted from the post-call summary.
7. SES email fallback fixed — added @aws-sdk/client-sesv2 so the fallback path
   resolves (SendGrid remains primary).
8. Automated tests — added a runnable vitest suite (6 tests: discovery query
   builder + billing plan invariants) and expanded the Python scoring suite
   (5 tests). Both green. CI (`npm run test`) now exercises the TS suite.

NOT done in this phase:
6. verify.sh full compile/migrate/boot — must run in your environment; the
   Prisma engine host is blocked in the build sandbox.

New deps: @aws-sdk/client-sesv2 (integrations), vitest (integrations dev).
Verified here: integrations typecheck PASS; 11 tests pass; all 34 models resolve.
