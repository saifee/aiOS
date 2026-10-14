# Upgrading to the new aiOS (existing Hostinger install)

1. **Replace the files in your GitHub repo** with the contents of this zip (keep your own `.env`, it is not in the zip), commit, and redeploy from Hostinger.
2. **Database**: with `AUTO_MIGRATE=true` the new tables are created on start. If the app can't do it itself, open phpMyAdmin -> your database -> SQL tab and run `docs/upgrade-existing-database.sql` (safe to run twice).
3. **Set a real `ENCRYPTION_KEY`** (64 hex characters, e.g. from `openssl rand -hex 32`). Users' AI keys are encrypted with it. If it is missing, Settings -> AI keys shows a warning and refuses to save keys. Don't change it later, or saved keys become unreadable.
4. **Your own account** keeps its current plan (Trial or Enterprise) and can use the server's `ANTHROPIC_API_KEY`. Anyone who signs up from the landing page starts on **Free**, which runs only on their own AI keys.
5. Do not set `AI_SERVICE_URL` on Hostinger.

## Plans
| Plan | AI | Outreach / calls |
|---|---|---|
| Free | Own keys only (platform keys are never used) | Not included, 25 leads / month |
| Starter / Growth / Scale | Own keys first, then the server's keys | Included, by plan limits |
| Trial / Enterprise | Own keys first, then the server's keys | Included |

To move a workspace to another plan manually: `UPDATE Tenant SET plan='ENTERPRISE' WHERE name='Your company';`
