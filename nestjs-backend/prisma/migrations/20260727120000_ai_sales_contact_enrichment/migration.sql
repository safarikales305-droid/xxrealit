-- AiSales contact enrichment (non-destructive)

CREATE TYPE "AiSalesContactType" AS ENUM ('EMAIL', 'PHONE');
CREATE TYPE "AiSalesContactVerificationStatus" AS ENUM (
  'NOT_CHECKED', 'ENRICHMENT_RUNNING', 'CONTACT_FOUND', 'PARTIALLY_VERIFIED', 'VERIFIED',
  'NO_PUBLIC_CONTACT', 'WEBSITE_UNAVAILABLE', 'BLOCKED_BY_WEBSITE', 'ENRICHMENT_FAILED',
  'MANUALLY_VERIFIED', 'PUBLICLY_LISTED', 'INVALID'
);
CREATE TYPE "AiSalesContactEnrichmentStatus" AS ENUM ('IDLE', 'RUNNING', 'COMPLETED', 'FAILED');

ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "autoEnrichContactsOnSearch" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "dailyEnrichmentLimit" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "enrichmentBatchLimit" INTEGER NOT NULL DEFAULT 20;

ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "primaryEmail" TEXT;
ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "primaryPhone" TEXT;
ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "contactVerificationStatus" "AiSalesContactVerificationStatus" NOT NULL DEFAULT 'NOT_CHECKED';
ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "contactEnrichmentStatus" "AiSalesContactEnrichmentStatus" NOT NULL DEFAULT 'IDLE';
ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "lastEnrichmentAt" TIMESTAMP(3);
ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "lastEnrichmentError" TEXT;
ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "contactSourceNote" TEXT;

ALTER TABLE "AiSalesSearchResult" ADD COLUMN IF NOT EXISTS "contactVerificationStatus" "AiSalesContactVerificationStatus" NOT NULL DEFAULT 'NOT_CHECKED';
ALTER TABLE "AiSalesSearchResult" ADD COLUMN IF NOT EXISTS "contactEnrichmentStatus" "AiSalesContactEnrichmentStatus" NOT NULL DEFAULT 'IDLE';
ALTER TABLE "AiSalesSearchResult" ADD COLUMN IF NOT EXISTS "lastEnrichmentAt" TIMESTAMP(3);
ALTER TABLE "AiSalesSearchResult" ADD COLUMN IF NOT EXISTS "lastEnrichmentError" TEXT;
ALTER TABLE "AiSalesSearchResult" ADD COLUMN IF NOT EXISTS "enrichmentLogJson" JSONB;

CREATE TABLE IF NOT EXISTS "AiSalesPublicContact" (
  "id" TEXT NOT NULL,
  "prospectId" TEXT,
  "searchResultId" TEXT,
  "type" "AiSalesContactType" NOT NULL,
  "value" TEXT NOT NULL,
  "normalizedValue" TEXT,
  "label" TEXT,
  "phoneKind" TEXT,
  "originalValue" TEXT,
  "sourceUrl" TEXT,
  "sourcePageTitle" TEXT,
  "sourceTextSnippet" TEXT,
  "verificationStatus" "AiSalesContactVerificationStatus" NOT NULL DEFAULT 'PUBLICLY_LISTED',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedById" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSalesPublicContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiSalesPublicContact_prospectId_idx" ON "AiSalesPublicContact"("prospectId");
CREATE INDEX IF NOT EXISTS "AiSalesPublicContact_searchResultId_idx" ON "AiSalesPublicContact"("searchResultId");
CREATE INDEX IF NOT EXISTS "AiSalesPublicContact_type_normalizedValue_idx" ON "AiSalesPublicContact"("type", "normalizedValue");
CREATE INDEX IF NOT EXISTS "AiSalesPublicContact_isPrimary_idx" ON "AiSalesPublicContact"("isPrimary");

DO $$ BEGIN
  ALTER TABLE "AiSalesPublicContact" ADD CONSTRAINT "AiSalesPublicContact_prospectId_fkey"
    FOREIGN KEY ("prospectId") REFERENCES "AiSalesProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "AiSalesPublicContact" ADD CONSTRAINT "AiSalesPublicContact_searchResultId_fkey"
    FOREIGN KEY ("searchResultId") REFERENCES "AiSalesSearchResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "AiSalesPublicContact" ADD CONSTRAINT "AiSalesPublicContact_verifiedById_fkey"
    FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
