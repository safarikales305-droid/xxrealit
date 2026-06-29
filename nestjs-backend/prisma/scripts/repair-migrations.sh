#!/bin/sh
# Repair failed migrations on Railway (no DB reset).
set -eu

BACKEND_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCHEMA="${PRISMA_SCHEMA_PATH:-$BACKEND_ROOT/prisma/schema.prisma}"

cd "$BACKEND_ROOT"

echo "[repair] cwd=$BACKEND_ROOT"
echo "[repair] schema=$SCHEMA"
echo "[repair] prisma generate"
npx prisma generate --schema="$SCHEMA"

for mig in \
  20260531140000_unique_account_identifiers \
  20260712120000_promo_profiles
do
  if npx prisma migrate status --schema="$SCHEMA" 2>&1 | grep -q "$mig"; then
    echo "[repair] marking rolled back: $mig"
    npx prisma migrate resolve --rolled-back "$mig" --schema="$SCHEMA" || true
  fi
done

echo "[repair] orphan Media check (read-only)"
npx prisma db execute --file prisma/scripts/repair-media-post-orphans.sql --schema="$SCHEMA" || true

echo "[repair] dedupe account identifiers (manual)"
npx prisma db execute --file prisma/scripts/dedupe-account-identifiers.sql --schema="$SCHEMA" || true

echo "[repair] prisma migrate deploy"
npx prisma migrate deploy --schema="$SCHEMA"

echo "[repair] done"
