-- AI Sales search + provider models

ALTER TYPE "AiSalesVerificationStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_VERIFIED';
ALTER TYPE "AiSalesVerificationStatus" ADD VALUE IF NOT EXISTS 'DUPLICATE';
ALTER TYPE "AiSalesVerificationStatus" ADD VALUE IF NOT EXISTS 'DO_NOT_CONTACT';

CREATE TYPE "AiSalesSearchStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "AiSalesSearchResultVerification" AS ENUM ('UNVERIFIED', 'PARTIALLY_VERIFIED', 'VERIFIED', 'INVALID', 'DUPLICATE', 'DO_NOT_CONTACT');
CREATE TYPE "AiSalesAnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "internalDatabaseEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "manualContactsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "csvImportEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "webProviderEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "dailySearchResultLimit" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "dailyAnalysisLimit" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "lastSearchAt" TIMESTAMP(3);
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "lastSearchSuccessAt" TIMESTAMP(3);
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "lastSearchErrorCode" TEXT;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "lastSearchErrorMessage" TEXT;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "lastProviderTestAt" TIMESTAMP(3);
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "lastProviderTestSuccess" BOOLEAN;

ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "sourceSearchResultId" TEXT;
ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "publicDataCheckedAt" TIMESTAMP(3);
ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "analysisStatus" "AiSalesAnalysisStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "analyzedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "AiSalesProspect_sourceSearchResultId_key" ON "AiSalesProspect"("sourceSearchResultId");
CREATE INDEX IF NOT EXISTS "AiSalesProspect_phone_idx" ON "AiSalesProspect"("phone");
CREATE INDEX IF NOT EXISTS "AiSalesProspect_website_idx" ON "AiSalesProspect"("website");
CREATE INDEX IF NOT EXISTS "AiSalesProspect_region_idx" ON "AiSalesProspect"("region");
CREATE INDEX IF NOT EXISTS "AiSalesProspect_analysisStatus_idx" ON "AiSalesProspect"("analysisStatus");

CREATE TABLE IF NOT EXISTS "AiSalesSearchProvider" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "providerType" TEXT NOT NULL,
  "domain" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "configured" BOOLEAN NOT NULL DEFAULT false,
  "maxRequestsDay" INTEGER NOT NULL DEFAULT 100,
  "lastCheckedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "configJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSalesSearchProvider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiSalesSearchProvider_key_key" ON "AiSalesSearchProvider"("key");
CREATE INDEX IF NOT EXISTS "AiSalesSearchProvider_enabled_idx" ON "AiSalesSearchProvider"("enabled");

CREATE TABLE IF NOT EXISTS "AiSalesSearch" (
  "id" TEXT NOT NULL,
  "partnerType" "AiSalesPartnerType",
  "region" TEXT,
  "district" TEXT,
  "city" TEXT,
  "keywordsJson" JSONB,
  "sourcesJson" JSONB,
  "specialization" TEXT,
  "minFitScore" INTEGER,
  "limit" INTEGER NOT NULL DEFAULT 30,
  "status" "AiSalesSearchStatus" NOT NULL DEFAULT 'PENDING',
  "totalFound" INTEGER NOT NULL DEFAULT 0,
  "newResults" INTEGER NOT NULL DEFAULT 0,
  "duplicateResults" INTEGER NOT NULL DEFAULT 0,
  "suppressedResults" INTEGER NOT NULL DEFAULT 0,
  "currentSource" TEXT,
  "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdById" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSalesSearch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AiSalesSearchResult" (
  "id" TEXT NOT NULL,
  "searchId" TEXT NOT NULL,
  "partnerType" "AiSalesPartnerType" NOT NULL,
  "companyName" TEXT NOT NULL,
  "contactName" TEXT,
  "publicEmail" TEXT,
  "publicPhone" TEXT,
  "website" TEXT,
  "city" TEXT,
  "region" TEXT,
  "specializationJson" JSONB,
  "source" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "relevanceReason" TEXT,
  "verificationStatus" "AiSalesSearchResultVerification" NOT NULL DEFAULT 'UNVERIFIED',
  "duplicateOfId" TEXT,
  "doNotContact" BOOLEAN NOT NULL DEFAULT false,
  "rawDataJson" JSONB,
  "savedProspectId" TEXT,
  "fitScore" INTEGER,
  "analysisJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSalesSearchResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiSalesSearch_status_createdAt_idx" ON "AiSalesSearch"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AiSalesSearch_createdById_idx" ON "AiSalesSearch"("createdById");
CREATE INDEX IF NOT EXISTS "AiSalesSearchResult_searchId_idx" ON "AiSalesSearchResult"("searchId");
CREATE INDEX IF NOT EXISTS "AiSalesSearchResult_companyName_idx" ON "AiSalesSearchResult"("companyName");
CREATE INDEX IF NOT EXISTS "AiSalesSearchResult_publicEmail_idx" ON "AiSalesSearchResult"("publicEmail");
CREATE INDEX IF NOT EXISTS "AiSalesSearchResult_website_idx" ON "AiSalesSearchResult"("website");
CREATE INDEX IF NOT EXISTS "AiSalesSearchResult_verificationStatus_idx" ON "AiSalesSearchResult"("verificationStatus");
CREATE INDEX IF NOT EXISTS "AiSalesSearchResult_doNotContact_idx" ON "AiSalesSearchResult"("doNotContact");

ALTER TABLE "AiSalesProspect" ADD CONSTRAINT "AiSalesProspect_sourceSearchResultId_fkey" FOREIGN KEY ("sourceSearchResultId") REFERENCES "AiSalesSearchResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesSearch" ADD CONSTRAINT "AiSalesSearch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesSearchResult" ADD CONSTRAINT "AiSalesSearchResult_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "AiSalesSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "AiSalesSearchProvider" ("id", "key", "name", "providerType", "enabled", "configured", "updatedAt")
VALUES
  ('internal-db', 'INTERNAL_DATABASE', 'Interní databáze XXREALIT', 'INTERNAL_DATABASE', true, true, CURRENT_TIMESTAMP),
  ('manual', 'MANUAL_CONTACTS', 'Ruční kontakty', 'MANUAL', true, true, CURRENT_TIMESTAMP),
  ('csv', 'CSV_IMPORT', 'CSV import', 'CSV', true, true, CURRENT_TIMESTAMP),
  ('bing', 'BING_WEB_SEARCH', 'Bing Web Search API', 'WEB_SEARCH', false, false, CURRENT_TIMESTAMP),
  ('serpapi', 'SERPAPI', 'SerpAPI', 'WEB_SEARCH', false, false, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
