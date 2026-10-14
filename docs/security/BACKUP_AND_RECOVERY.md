# Backup & Recovery

The application does not back itself up; it relies on the database host.

| Item | Procedure | Target |
|---|---|---|
| Database | Hostinger hPanel automatic backups **plus** a weekly manual `mysqldump` export stored off-host (encrypted) | RPO ≤ 24 h (host) / 7 d (manual) |
| Configuration | keep the env var list (names only, not values) in this repo; values in a password manager | — |
| Code | GitHub repository + tagged release zips | — |
| Encryption key | store `ENCRYPTION_KEY` in the password manager — **without it, BYOK keys and integration credentials in backups are unreadable** | — |

Restore test: quarterly, restore a dump into a scratch database, boot with matching `ENCRYPTION_KEY`, sign in, confirm a BYOK key decrypts. RTO target: 4 hours. Status: procedure documented **[I]**; first restore test not yet performed **[P]**.
