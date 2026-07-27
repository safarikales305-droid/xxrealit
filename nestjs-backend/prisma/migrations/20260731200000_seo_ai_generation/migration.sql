-- SEO AI generation: extend SeoPageContent + job queue models

CREATE TYPE "SeoAiGenerationJobStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');
CREATE TYPE "SeoAiGenerationItemStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'REVIEW', 'REGENERATED', 'FAILED', 'SKIPPED');
CREATE TYPE "SeoAiLayoutType" AS ENUM (
  'LOCALITY_GUIDE',
  'PROPERTY_OVERVIEW',
  'FAMILY_LIVING',
  'INVESTMENT_GUIDE',
  'CITY_AND_SURROUNDINGS',
  'COMPACT_SEARCH_PAGE',
  'EDITORIAL_REAL_ESTATE_GUIDE'
);
CREATE TYPE "SeoGenerationMode" AS ENUM ('TEMPLATE', 'AI');

ALTER TYPE "SeoContentStatus" ADD VALUE IF NOT EXISTS 'AI_GENERATING';
ALTER TYPE "SeoContentStatus" ADD VALUE IF NOT EXISTS 'AI_REVIEW';
ALTER TYPE "SeoContentStatus" ADD VALUE IF NOT EXISTS 'NEEDS_IMPROVEMENT';
ALTER TYPE "SeoContentStatus" ADD VALUE IF NOT EXISTS 'ERROR';
ALTER TYPE "SeoContentStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

ALTER TABLE "SeoPageContent"
  ADD COLUMN IF NOT EXISTS "editorialTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "subtitle" TEXT,
  ADD COLUMN IF NOT EXISTS "aiModel" TEXT,
  ADD COLUMN IF NOT EXISTS "aiPromptVersionId" TEXT,
  ADD COLUMN IF NOT EXISTS "aiGeneratedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "aiQualityScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "uniquenessScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "duplicateRisk" TEXT,
  ADD COLUMN IF NOT EXISTS "similarPageIdsJson" JSONB,
  ADD COLUMN IF NOT EXISTS "factCheckStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "layoutType" "SeoAiLayoutType",
  ADD COLUMN IF NOT EXISTS "contentBlocksJson" JSONB,
  ADD COLUMN IF NOT EXISTS "sourceClaimsJson" JSONB,
  ADD COLUMN IF NOT EXISTS "generationMode" "SeoGenerationMode" NOT NULL DEFAULT 'TEMPLATE',
  ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SeoPageContent_generationMode_idx" ON "SeoPageContent"("generationMode");
CREATE INDEX IF NOT EXISTS "SeoPageContent_aiGenerated_idx" ON "SeoPageContent"("aiGenerated");
CREATE INDEX IF NOT EXISTS "SeoPageContent_uniquenessScore_idx" ON "SeoPageContent"("uniquenessScore");

CREATE TABLE IF NOT EXISTS "SeoAiGenerationJob" (
  "id" TEXT NOT NULL,
  "status" "SeoAiGenerationJobStatus" NOT NULL DEFAULT 'PENDING',
  "requestedCount" INTEGER NOT NULL DEFAULT 1,
  "processedCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "reviewCount" INTEGER NOT NULL DEFAULT 0,
  "regeneratedCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostCzk" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "actualCostCzk" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "promptVersionId" TEXT,
  "model" TEXT,
  "settingsJson" JSONB,
  "currentItem" TEXT,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SeoAiGenerationJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SeoAiGenerationItem" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "seoPageId" TEXT,
  "locationId" TEXT,
  "intentSlug" TEXT,
  "status" "SeoAiGenerationItemStatus" NOT NULL DEFAULT 'PENDING',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "qualityScore" INTEGER,
  "uniquenessScore" INTEGER,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "costCzk" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "inputJson" JSONB,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeoAiGenerationItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SeoAiGenerationJob_status_idx" ON "SeoAiGenerationJob"("status");
CREATE INDEX IF NOT EXISTS "SeoAiGenerationJob_createdAt_idx" ON "SeoAiGenerationJob"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SeoAiGenerationItem_jobId_idx" ON "SeoAiGenerationItem"("jobId");
CREATE INDEX IF NOT EXISTS "SeoAiGenerationItem_status_idx" ON "SeoAiGenerationItem"("status");
CREATE INDEX IF NOT EXISTS "SeoAiGenerationItem_seoPageId_idx" ON "SeoAiGenerationItem"("seoPageId");

ALTER TABLE "SeoAiGenerationItem"
  ADD CONSTRAINT "SeoAiGenerationItem_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "SeoAiGenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SeoAiGenerationItem"
  ADD CONSTRAINT "SeoAiGenerationItem_seoPageId_fkey"
  FOREIGN KEY ("seoPageId") REFERENCES "SeoPageContent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
