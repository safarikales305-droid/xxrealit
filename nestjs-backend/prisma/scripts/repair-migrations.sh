#!/bin/sh
# Repair failed migrations on Railway (no DB reset).
set -eu
cd "$(dirname "$0")/.."

echo "[repair] prisma generate"
npx prisma generate

for mig in \
  20260531140000_unique_account_identifiers \
  20260712120000_promo_profiles
do
  if npx prisma migrate status 2>&1 | grep -q "$mig"; then
    echo "[repair] marking rolled back: $mig"
    npx prisma migrate resolve --rolled-back "$mig" || true
  fi
done

echo "[repair] orphan Media check (read-only)"
npx prisma db execute --file prisma/scripts/repair-media-post-orphans.sql || true

echo "[repair] dedupe account identifiers (manual)"
npx prisma db execute --file prisma/scripts/dedupe-account-identifiers.sql || true

echo "[repair] prisma migrate deploy"
npx prisma migrate deploy

echo "[repair] done"
