-- Promo profiles for admin-managed portal filler accounts
ALTER TABLE "User" ADD COLUMN "isPromoProfile" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "promoProfileActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "promoFirstName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "promoLastName" TEXT NOT NULL DEFAULT '';

CREATE INDEX "User_promo_public_idx" ON "User" ("isPromoProfile", "promoProfileActive", "isPublicBrokerProfile");
