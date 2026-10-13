#!/usr/bin/env bash
# Builds kingslee-aios-hostinger.zip — a ready-to-run package for Hostinger Cloud.
# Upload it, set the entry file to app.js, add env vars. NO `npm install` and NO build step on the host.
# Needs internet (downloads Prisma engines for Hostinger's Linux). Run on your PC, a VPS, or via GitHub Actions.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=deploy-hostinger
say(){ printf "\n\033[1;36m▶ %s\033[0m\n" "$1"; }

say "Installing dependencies";            npm install --no-audit --no-fund

say "Generating Prisma client + engines for Hostinger (RHEL/CloudLinux + Debian, OpenSSL 1.0/1.1/3)"
SCHEMA=packages/db/prisma/schema.deploy.prisma
sed 's/provider = "prisma-client-js"/provider = "prisma-client-js"\n  binaryTargets = ["native","debian-openssl-3.0.x","debian-openssl-1.1.x","rhel-openssl-1.0.x","rhel-openssl-1.1.x","rhel-openssl-3.0.x"]/' \
  packages/db/prisma/schema.prisma > "$SCHEMA"
[ -n "${SKIP_GENERATE:-}" ] || DATABASE_URL="mysql://x:x@localhost:3306/x" npx prisma generate --schema="$SCHEMA"   # SKIP_GENERATE=1 only for layout tests
rm -f "$SCHEMA"

say "Generating schema.sql";               node scripts/gen-mysql-sql.mjs
say "Building web UI (static export)";     NEXT_PUBLIC_API_URL="" npm -w apps/web run build
say "Bundling API (all libraries inside)"; npm -w apps/api run build:standalone

say "Assembling $OUT/"
rm -rf "$OUT" kingslee-aios-hostinger.zip
mkdir -p "$OUT/apps/api/dist" "$OUT/apps/web" "$OUT/packages/db/prisma" "$OUT/node_modules/@prisma"
cp apps/api/dist-standalone/server.js "$OUT/apps/api/dist/server.js"
cp -r apps/web/out "$OUT/apps/web/out"
cp packages/db/prisma/schema.sql "$OUT/packages/db/prisma/schema.sql"
cp app.js "$OUT/app.js"
cp -r node_modules/@prisma/client "$OUT/node_modules/@prisma/client"
cp -r node_modules/.prisma "$OUT/node_modules/.prisma"
find "$OUT/node_modules" -name "*.d.ts" -delete
# no dependencies listed on purpose: the host has nothing to install
cat > "$OUT/package.json" <<'JSON'
{ "name": "kingslee-aios", "version": "1.0.0", "private": true, "main": "app.js",
  "scripts": { "start": "node app.js" }, "engines": { "node": ">=20" } }
JSON

say "Zipping"
(cd "$OUT" && zip -qr ../kingslee-aios-hostinger.zip .)
ls -lh kingslee-aios-hostinger.zip
printf "\n\033[1;32m✓ Done. Upload kingslee-aios-hostinger.zip in hPanel → Node.js (see docs/HOSTINGER-CLOUD.md)\033[0m\n"
