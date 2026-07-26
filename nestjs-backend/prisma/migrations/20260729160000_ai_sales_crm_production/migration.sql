-- AI Sales CRM production: memory, statuses, settings

ALTER TYPE "AiSalesProspectStatus" ADD VALUE IF NOT EXISTS 'ANALYZED';
ALTER TYPE "AiSalesProspectStatus" ADD VALUE IF NOT EXISTS 'WAITING_REPLY';
ALTER TYPE "AiSalesProspectStatus" ADD VALUE IF NOT EXISTS 'IN_NEGOTIATION';
ALTER TYPE "AiSalesProspectStatus" ADD VALUE IF NOT EXISTS 'REGISTRATION';
ALTER TYPE "AiSalesProspectStatus" ADD VALUE IF NOT EXISTS 'ACTIVE_PARTNER';

ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "autoAnalyzeOnSave" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "followUpFirstDays" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "followUpSecondDays" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "companyProfileJson" JSONB;
ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "aiRecommendationJson" JSONB;

CREATE TABLE IF NOT EXISTS "AiSalesPartnerMemory" (
  "id" TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "memoryType" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "sourceId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiSalesPartnerMemory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiSalesPartnerMemory_prospectId_createdAt_idx" ON "AiSalesPartnerMemory"("prospectId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AiSalesPartnerMemory_memoryType_idx" ON "AiSalesPartnerMemory"("memoryType");

DO $$ BEGIN
  ALTER TABLE "AiSalesPartnerMemory" ADD CONSTRAINT "AiSalesPartnerMemory_prospectId_fkey"
    FOREIGN KEY ("prospectId") REFERENCES "AiSalesProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
