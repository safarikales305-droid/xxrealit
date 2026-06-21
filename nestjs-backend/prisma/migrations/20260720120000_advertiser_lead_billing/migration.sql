-- Advertiser lead billing + article CMS extensions
ALTER TABLE "ContactLead" ADD COLUMN IF NOT EXISTS "message" TEXT;
ALTER TABLE "ContactLead" ADD COLUMN IF NOT EXISTS "leadSource" TEXT;
ALTER TABLE "ContactLead" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'UNLOCKED';
ALTER TABLE "ContactLead" ADD COLUMN IF NOT EXISTS "unlockedAt" TIMESTAMP(3);

ALTER TABLE "ContactMonetizationSetting" ADD COLUMN IF NOT EXISTS "leadPriceClassic" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "ContactMonetizationSetting" ADD COLUMN IF NOT EXISTS "leadPriceShorts" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "ContactMonetizationSetting" ADD COLUMN IF NOT EXISTS "leadPriceDeveloper" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "ContactMonetizationSetting" ADD COLUMN IF NOT EXISTS "leadPriceCompany" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "ContactMonetizationSetting" ADD COLUMN IF NOT EXISTS "tipMinContactPrice" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ContactMonetizationSetting" ADD COLUMN IF NOT EXISTS "tipMaxContactPrice" INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE "ContactMonetizationSetting" ADD COLUMN IF NOT EXISTS "tipSuccessBonus" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PurchaseAdviceArticle" ADD COLUMN IF NOT EXISTS "galleryUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "PurchaseAdviceArticle" ADD COLUMN IF NOT EXISTS "seoTitle" TEXT;
ALTER TABLE "PurchaseAdviceArticle" ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;

UPDATE "ContactMonetizationSetting"
SET
  "leadPriceClassic" = COALESCE("ownerListingContactPrice", 50)
WHERE "id" = 'default';

UPDATE "PurchaseAdviceArticle"
SET "category" = 'rady-pri-koupi'
WHERE "category" = 'obecne';
