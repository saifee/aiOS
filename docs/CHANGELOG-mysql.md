# MySQL / MariaDB edition

- Database: PostgreSQL -> MySQL/MariaDB (`DATABASE_URL=mysql://user:pass@host:3306/db`). Original Postgres schema kept for reference in `packages/db/prisma/alt/schema.postgres.prisma` (not maintained).
- List columns (keywords, cities, emails, phones, follow-up days, ...) are JSON columns with `[]` defaults. Read them with `arr()` from `@leadhunter/db`.
- Knowledge Brain: embeddings stored as JSON; cosine similarity computed in the app (`packages/agents/src/memory.ts`).
- Raw SQL removed except `findLeadByListValue()` (JSON_CONTAINS). Case-insensitive search is the MySQL default.
- `packages/db/prisma/schema.sql` is generated (`npm run db:sql`) – idempotent DDL, tested on MariaDB 10.11 (37 tables, 22 foreign keys).
- Passwords: Node `scrypt` instead of argon2 (no native module).
- `scripts/package-hostinger.sh` / "Build Hostinger package" workflow -> `kingslee-aios-hostinger.zip`: everything bundled, no `npm install` on the host.
- Docker: MariaDB 10.11 replaces Postgres. Render: needs an external MySQL.
