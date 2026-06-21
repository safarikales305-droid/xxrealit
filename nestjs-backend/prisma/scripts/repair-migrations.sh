#!/bin/sh
# Repair failed promo_profiles migration on Railway (no DB reset).
set -eu
cd "$(dirname "$0")/.."

echo "[repair] prisma generate"
npx prisma generate

if npx prisma migrate status 2>&1 | grep -q "20260712120000_promo_profiles"; then
  echo "[repair] marking rolled back: 20260712120000_promo_profiles"
  npx prisma migrate resolve --rolled-back 20260712120000_promo_profiles || true
fi

echo "[repair] orphan Media check (read-only)"
npx prisma db execute --file prisma/scripts/repair-media-post-orphans.sql || true

echo "[repair] prisma migrate deploy"
npx prisma migrate deploy

echo "[repair] done"
