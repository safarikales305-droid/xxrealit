#!/bin/sh
# Safe migrate deploy for Railway: resolve known failed migrations, never block API start.
set -u

BACKEND_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCHEMA="${PRISMA_SCHEMA_PATH:-$BACKEND_ROOT/prisma/schema.prisma}"

cd "$BACKEND_ROOT"

echo "[migrate] cwd=$BACKEND_ROOT"
echo "[migrate] schema=$SCHEMA"

echo "[migrate] prisma generate"
if ! npx prisma generate --schema="$SCHEMA"; then
  echo "[migrate] ERROR: prisma generate failed (cwd=$BACKEND_ROOT schema=$SCHEMA)"
  exit 1
fi

for mig in \
  20260531140000_unique_account_identifiers \
  20260712120000_promo_profiles
do
  echo "[migrate] resolve rolled-back (if failed): $mig"
  npx prisma migrate resolve --rolled-back "$mig" --schema="$SCHEMA" 2>/dev/null || true
done

echo "[migrate] prisma migrate deploy"
if npx prisma migrate deploy --schema="$SCHEMA"; then
  echo "[migrate] deploy succeeded"
else
  echo "[migrate] ERROR: prisma migrate deploy failed — trying db push for schema sync"
  if npx prisma db push --schema="$SCHEMA" --skip-generate --accept-data-loss; then
    echo "[migrate] db push succeeded (fallback)"
  else
    echo "[migrate] ERROR: db push also failed — continuing API start anyway"
  fi
fi

exit 0
