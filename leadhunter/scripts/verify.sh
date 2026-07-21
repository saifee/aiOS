#!/usr/bin/env bash
# Bring-up + verification for Kingslee AIOS. Run from repo root in an
# environment with network access to binaries.prisma.sh (your machine/VPS).
set -euo pipefail
info(){ printf "\n\033[1;36m▶ %s\033[0m\n" "$1"; }
ok(){ printf "\033[1;32m✓ %s\033[0m\n" "$1"; }

info "1/8 Install dependencies";           npm install
info "2/8 Start Postgres + Redis";          docker compose up -d postgres redis
info "3/8 Enable pgvector";                 sleep 4; docker compose exec -T postgres psql -U leadhunter -d leadhunter -f - < packages/db/prisma/migrations/manual/000_pgvector.sql || \
  docker compose exec -T postgres psql -U leadhunter -d leadhunter -c "CREATE EXTENSION IF NOT EXISTS vector;"
info "4/8 Generate Prisma client";          npm -w packages/db run generate
info "5/8 Run migrations";                  npm -w packages/db run migrate:dev
info "6/8 Seed demo tenant + 27 agents";    npm -w packages/db run seed
info "7/8 Typecheck + build all workspaces"; npm run build
info "8/8 Python AI service";               (cd services/ai && pip install -r requirements.txt >/dev/null && python -m pytest tests -q)
ok "Build + verification passed."

cat <<'NEXT'

Next — smoke test the running system (in separate terminals):
  npm -w apps/api run dev         # http://localhost:4000/health
  npm -w apps/workers run dev
  (cd services/ai && uvicorn main:app --reload)   # http://localhost:8000/health
  npm -w services/voice run dev   # ws://localhost:5050/twilio  (needs OPENAI_API_KEY)
  npm -w apps/web run dev         # http://localhost:3000

Then: register at /login → Settings (create business) → Command Center → type a command.
NEXT
