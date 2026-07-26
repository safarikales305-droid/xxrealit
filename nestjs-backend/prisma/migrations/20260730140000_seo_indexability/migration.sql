ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "indexable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "indexabilityReason" TEXT;
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "indexabilityScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "indexabilityChecksJson" JSONB;
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "lastIndexabilityCheckAt" TIMESTAMP(3);
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "inSitemap" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "lastHttpStatus" INTEGER;

ALTER TABLE "SeoSettings" ADD COLUMN IF NOT EXISTS "programmaticIndexabilityMinScore" INTEGER NOT NULL DEFAULT 70;
ALTER TABLE "SeoSettings" ADD COLUMN IF NOT EXISTS "programmaticIndexabilityReviewScore" INTEGER NOT NULL DEFAULT 50;

CREATE INDEX IF NOT EXISTS "SeoPageContent_indexable_idx" ON "SeoPageContent"("indexable");
CREATE INDEX IF NOT EXISTS "SeoPageContent_indexabilityReason_idx" ON "SeoPageContent"("indexabilityReason");
