-- Company enrichment, SEO, and social publish automation

CREATE TYPE "CompanyEnrichmentStatus" AS ENUM ('DISCOVERY_PENDING', 'PARTIALLY_ENRICHED', 'ENRICHED', 'VERIFIED');
CREATE TYPE "CompanyWebsiteSource" AS ENUM ('MANUAL_ADMIN', 'VERIFIED', 'DISCOVERED_HIGH', 'DISCOVERED_MEDIUM', 'IMPORTED', 'ARES');
CREATE TYPE "CompanySeoStatus" AS ENUM ('SEO_NOT_READY', 'SEO_READY');
CREATE TYPE "CompanyIndexStatus" AS ENUM ('SEO_READY', 'INDEXABLE', 'INDEXED', 'NOT_INDEXED', 'UNKNOWN');
CREATE TYPE "CompanySocialPublishQueueStatus" AS ENUM ('WAITING', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'SKIPPED');
CREATE TYPE "CompanyContentEnrichmentJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

ALTER TYPE "CompanyAuditAction" ADD VALUE IF NOT EXISTS 'CONTENT_ENRICHMENT';
ALTER TYPE "CompanyAuditAction" ADD VALUE IF NOT EXISTS 'SEO_UPDATE';

ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "websiteSource" "CompanyWebsiteSource";
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "websiteConfidence" DOUBLE PRECISION;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "websiteVerifiedAt" TIMESTAMP(3);
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "websiteManualOverride" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "discoveredEmail" TEXT;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "emailSourceUrl" TEXT;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "emailConfidence" DOUBLE PRECISION;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "emailDiscoveredAt" TIMESTAMP(3);
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "enrichmentStatus" "CompanyEnrichmentStatus" NOT NULL DEFAULT 'DISCOVERY_PENDING';
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "shortDescription" TEXT;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "enrichmentData" JSONB;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "contentEnrichedAt" TIMESTAMP(3);
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "contentRefreshDueAt" TIMESTAMP(3);
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "contentEnrichmentError" TEXT;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "seoTitle" TEXT;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "seoKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "seoQualityScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "seoStatus" "CompanySeoStatus" NOT NULL DEFAULT 'SEO_NOT_READY';
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "indexStatus" "CompanyIndexStatus" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "seoLastSignificantChangeAt" TIMESTAMP(3);
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "previousSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "socialIntroPublishedAt" TIMESTAMP(3);
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "socialIntroPostId" TEXT;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "hidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "inLiquidation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "inactive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "dissolved" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "CompanyDirectoryEntry_seoStatus_seoQualityScore_idx" ON "CompanyDirectoryEntry"("seoStatus", "seoQualityScore");
CREATE INDEX IF NOT EXISTS "CompanyDirectoryEntry_enrichmentStatus_idx" ON "CompanyDirectoryEntry"("enrichmentStatus");
CREATE INDEX IF NOT EXISTS "CompanyDirectoryEntry_hidden_inLiquidation_inactive_dissolved_idx" ON "CompanyDirectoryEntry"("hidden", "inLiquidation", "inactive", "dissolved");

CREATE TABLE IF NOT EXISTS "CompanyContentEnrichmentJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "CompanyContentEnrichmentJobStatus" NOT NULL DEFAULT 'PENDING',
    "websiteUrl" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyContentEnrichmentJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanySocialPublishQueueItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "CompanySocialPublishQueueStatus" NOT NULL DEFAULT 'WAITING',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "facebookPostId" TEXT,
    "templateVariant" TEXT,
    "postText" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "skippedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanySocialPublishQueueItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanySocialPublishQueueItem_companyId_key" ON "CompanySocialPublishQueueItem"("companyId");
CREATE INDEX IF NOT EXISTS "CompanyContentEnrichmentJob_status_createdAt_idx" ON "CompanyContentEnrichmentJob"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "CompanyContentEnrichmentJob_companyId_createdAt_idx" ON "CompanyContentEnrichmentJob"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "CompanySocialPublishQueueItem_status_scheduledAt_idx" ON "CompanySocialPublishQueueItem"("status", "scheduledAt");

ALTER TABLE "CompanyContentEnrichmentJob" ADD CONSTRAINT "CompanyContentEnrichmentJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanySocialPublishQueueItem" ADD CONSTRAINT "CompanySocialPublishQueueItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
