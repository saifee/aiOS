#!/usr/bin/env bash
# Kingslee AIOS — interactive installer for self-hosting (local machine or VPS).
# Prompts for database + Redis + your Anthropic key, writes .env, sets up the
# database, seeds it, and tells you how to start. Run from the repo root.
set -euo pipefail
say(){ printf "\n\033[1;36m%s\033[0m\n" "$1"; }
ask(){ local p="$1" d="${2:-}" v; if [ -n "$d" ]; then read -rp "$p [$d]: " v; echo "${v:-$d}"; else read -rp "$p: " v; echo "$v"; fi; }
asksecret(){ local p="$1" v; read -rsp "$p: " v; echo "" >&2; echo "$v"; }

say "Kingslee AIOS installer"
echo "Answer a few questions and I'll configure everything."

DB_HOST=$(ask "Database host" "localhost")
DB_PORT=$(ask "Database port" "5432")
DB_USER=$(ask "Database user" "leadhunter")
DB_PASS=$(asksecret "Database password")
DB_NAME=$(ask "Database name" "leadhunter")
REDIS_URL=$(ask "Redis URL" "redis://localhost:6379")
say "AI keys (Anthropic is required; the rest are optional — press Enter to skip)"
ANTHROPIC=$(asksecret "ANTHROPIC_API_KEY")
OPENAI=$(asksecret "OPENAI_API_KEY (optional)")

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
JWT_SECRET=$(openssl rand -hex 32)
ENC_KEY=$(openssl rand -hex 32)

say "Writing .env"
cat > .env <<ENV
NODE_ENV=production
APP_URL=http://localhost:3000
API_URL=http://localhost:4000
AI_SERVICE_URL=http://localhost:8000
DATABASE_URL=${DATABASE_URL}
REDIS_URL=${REDIS_URL}
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENC_KEY}
CLAUDE_MODEL=claude-sonnet-4-5
ANTHROPIC_API_KEY=${ANTHROPIC}
OPENAI_API_KEY=${OPENAI}
DEFAULT_FROM_EMAIL=hello@localhost
ENV
echo ".env written."

say "Optional: start Postgres + Redis with Docker?"
read -rp "Start local Postgres+Redis containers now? (y/N): " startdb
if [[ "$startdb" =~ ^[Yy] ]]; then
  docker run -d --name kingslee-pg -e POSTGRES_USER="$DB_USER" -e POSTGRES_PASSWORD="$DB_PASS" -e POSTGRES_DB="$DB_NAME" -p "${DB_PORT}:5432" pgvector/pgvector:pg16 || true
  docker run -d --name kingslee-redis -p 6379:6379 redis:7-alpine || true
  echo "Waiting for Postgres…"; sleep 6
fi

say "Installing dependencies"; npm install
say "Generating database client"; npm -w packages/db run generate
say "Creating database schema (+ pgvector extension)"; npm -w packages/db run migrate
say "Seeding starter data + AI departments"; npm -w packages/db run seed || true

say "Done ✓"
cat <<NEXT
Start the app (each in its own terminal), or use: docker compose up
  npm -w apps/api run dev        # http://localhost:4000
  npm -w apps/workers run dev
  (cd services/ai && pip install -r requirements.txt && uvicorn main:app --reload)
  npm -w apps/web run dev        # http://localhost:3000

Then open http://localhost:3000/setup to create your admin account.
NEXT
