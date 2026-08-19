-- Company SEO bulk regeneration: dirty flag, input hash, BULK_ALL job type
ALTER TYPE "CompanySeoGenerationJobType" ADD VALUE IF NOT EXISTS 'BULK_ALL';

ALTER TABLE "CompanyDirectoryEntry"
  ADD COLUMN IF NOT EXISTS "seoDirty" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "seoInputHash" TEXT;

ALTER TABLE "CompanySeoGenerationJob"
  ADD COLUMN IF NOT EXISTS "unchangedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "currentCompanyId" TEXT,
  ADD COLUMN IF NOT EXISTS "summaryJson" JSONB,
  ADD COLUMN IF NOT EXISTS "dryRun" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "CompanyDirectoryEntry_seoDirty_idx" ON "CompanyDirectoryEntry"("seoDirty");
