-- Additive: AI property finder leads, session fields, analytics events

CREATE TYPE "AiPropertyFinderLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'SPAM', 'CLOSED');

ALTER TYPE "AiPropertyFinderEventName" ADD VALUE IF NOT EXISTS 'AI_PROPERTY_FINDER_OPEN';
ALTER TYPE "AiPropertyFinderEventName" ADD VALUE IF NOT EXISTS 'AI_PROPERTY_FINDER_QUERY';
ALTER TYPE "AiPropertyFinderEventName" ADD VALUE IF NOT EXISTS 'AI_PROPERTY_FINDER_EMAIL_REQUESTED';
ALTER TYPE "AiPropertyFinderEventName" ADD VALUE IF NOT EXISTS 'AI_PROPERTY_FINDER_LEAD_CREATED';
ALTER TYPE "AiPropertyFinderEventName" ADD VALUE IF NOT EXISTS 'AI_PROPERTY_FINDER_SEARCH_STARTED';
ALTER TYPE "AiPropertyFinderEventName" ADD VALUE IF NOT EXISTS 'AI_PROPERTY_FINDER_RESULTS';
ALTER TYPE "AiPropertyFinderEventName" ADD VALUE IF NOT EXISTS 'AI_PROPERTY_FINDER_RESULT_DETAIL';
ALTER TYPE "AiPropertyFinderEventName" ADD VALUE IF NOT EXISTS 'AI_PROPERTY_FINDER_EXTERNAL_CLICK';
ALTER TYPE "AiPropertyFinderEventName" ADD VALUE IF NOT EXISTS 'AI_PROPERTY_FINDER_CLOSED';
ALTER TYPE "AiPropertyFinderEventName" ADD VALUE IF NOT EXISTS 'AI_PROPERTY_FINDER_REOPENED';

ALTER TABLE "AiPropertySearchSession" ADD COLUMN IF NOT EXISTS "lastResultsJson" JSONB;
ALTER TABLE "AiPropertySearchSession" ADD COLUMN IF NOT EXISTS "pendingQuery" TEXT;
ALTER TABLE "AiPropertySearchSession" ADD COLUMN IF NOT EXISTS "leadEmail" TEXT;
ALTER TABLE "AiPropertySearchSession" ADD COLUMN IF NOT EXISTS "leadMarketingConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiPropertySearchSession" ADD COLUMN IF NOT EXISTS "leadCapturedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "AiPropertySearchSession_leadEmail_idx" ON "AiPropertySearchSession"("leadEmail");

CREATE TABLE "AiPropertyFinderLead" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "status" "AiPropertyFinderLeadStatus" NOT NULL DEFAULT 'NEW',
  "initialQuery" TEXT,
  "parsedCriteriaJson" JSONB,
  "locationLabel" TEXT,
  "budgetMax" INTEGER,
  "propertyTypeLabel" TEXT,
  "sourcePage" TEXT,
  "sourcePageUrl" TEXT,
  "sourceSeoIntent" TEXT,
  "sourceSeoLocation" TEXT,
  "resultsCount" INTEGER,
  "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  "visitorId" TEXT,
  "sessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiPropertyFinderLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiPropertyFinderLead_email_idx" ON "AiPropertyFinderLead"("email");
CREATE INDEX "AiPropertyFinderLead_status_createdAt_idx" ON "AiPropertyFinderLead"("status", "createdAt");
CREATE INDEX "AiPropertyFinderLead_sessionId_idx" ON "AiPropertyFinderLead"("sessionId");

ALTER TABLE "AiPropertyFinderLead" ADD CONSTRAINT "AiPropertyFinderLead_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiPropertySearchSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
