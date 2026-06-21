#!/bin/sh
# Safe migrate deploy for Railway: resolve known failed migrations, never block API start.
set -u

cd "$(dirname "$0")/.."

echo "[migrate] prisma generate"
if ! npx prisma generate; then
  echo "[migrate] ERROR: prisma generate failed"
  exit 1
fi

for mig in \
  20260531140000_unique_account_identifiers \
  20260712120000_promo_profiles
do
  echo "[migrate] resolve rolled-back (if failed): $mig"
  npx prisma migrate resolve --rolled-back "$mig" 2>/dev/null || true
done

echo "[migrate] prisma migrate deploy"
if npx prisma migrate deploy; then
  echo "[migrate] deploy succeeded"
else
  echo "[migrate] ERROR: prisma migrate deploy failed — continuing API start anyway"
fi

exit 0
