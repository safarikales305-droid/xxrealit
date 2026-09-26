-- AI Property Finder for programmatic SEO pages

CREATE TYPE "AiPropertyFinderEventName" AS ENUM (
  'AI_FINDER_SHOWN',
  'AI_FINDER_OPENED',
  'AI_SEARCH_STARTED',
  'AI_SEARCH_COMPLETED',
  'AI_RESULT_CLICKED',
  'AI_EXTERNAL_RESULT_CLICKED',
  'AI_QUERY_REFINED',
  'AI_WATCH_CREATED',
  'AI_FINDER_DISMISSED'
);

CREATE TABLE "AiPropertyFinderSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "popupDelaySec" INTEGER NOT NULL DEFAULT 8,
  "popupScrollPercent" INTEGER NOT NULL DEFAULT 30,
  "popupOnInteraction" BOOLEAN NOT NULL DEFAULT true,
  "popupAsCtaOnly" BOOLEAN NOT NULL DEFAULT false,
  "externalDiscoveryEnabled" BOOLEAN NOT NULL DEFAULT true,
  "cacheTtlMinutes" INTEGER NOT NULL DEFAULT 20,
  "minMatchScore" INTEGER NOT NULL DEFAULT 40,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiPropertyFinderSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiPropertyFinderEvent" (
  "id" TEXT NOT NULL,
  "eventName" "AiPropertyFinderEventName" NOT NULL,
  "visitorId" TEXT,
  "sessionId" TEXT,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiPropertyFinderEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiPropertySearchSession" (
  "id" TEXT NOT NULL,
  "visitorId" TEXT,
  "sourcePage" TEXT,
  "sourceSeoIntent" TEXT,
  "sourceSeoLocation" TEXT,
  "initialQuery" TEXT,
  "parsedCriteriaJson" JSONB,
  "messagesJson" JSONB,
  "resultsCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiPropertySearchSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiPropertySearchWatch" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "criteriaJson" JSONB NOT NULL,
  "consent" BOOLEAN NOT NULL DEFAULT false,
  "notificationEnabled" BOOLEAN NOT NULL DEFAULT true,
  "sourceSessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiPropertySearchWatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiPropertyFinderEvent_eventName_createdAt_idx" ON "AiPropertyFinderEvent"("eventName", "createdAt");
CREATE INDEX "AiPropertyFinderEvent_sessionId_idx" ON "AiPropertyFinderEvent"("sessionId");
CREATE INDEX "AiPropertySearchSession_createdAt_idx" ON "AiPropertySearchSession"("createdAt");
CREATE INDEX "AiPropertySearchSession_visitorId_idx" ON "AiPropertySearchSession"("visitorId");
CREATE INDEX "AiPropertySearchWatch_email_idx" ON "AiPropertySearchWatch"("email");
CREATE INDEX "AiPropertySearchWatch_createdAt_idx" ON "AiPropertySearchWatch"("createdAt");

ALTER TABLE "AiPropertySearchWatch" ADD CONSTRAINT "AiPropertySearchWatch_sourceSessionId_fkey" FOREIGN KEY ("sourceSessionId") REFERENCES "AiPropertySearchSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "AiPropertyFinderSettings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);
