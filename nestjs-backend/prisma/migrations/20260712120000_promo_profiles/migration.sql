-- Promo profiles for admin-managed portal filler accounts (idempotent for failed/retry deploy)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPromoProfile" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "promoProfileActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "promoFirstName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "promoLastName" TEXT NOT NULL DEFAULT '';

-- Index depends on isPublicBrokerProfile (added in broker_public_profile migration)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPublicBrokerProfile" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "User_promo_public_idx" ON "User" ("isPromoProfile", "promoProfileActive", "isPublicBrokerProfile");
