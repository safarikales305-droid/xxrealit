CREATE TYPE "AiInfluencerTopicCandidateStatus" AS ENUM (
  'DISCOVERED',
  'ANALYZING',
  'VERIFYING',
  'READY',
  'APPROVED',
  'REJECTED',
  'DUPLICATE',
  'OUTDATED',
  'VIDEO_QUEUED',
  'VIDEO_CREATED'
);

CREATE TYPE "AiInfluencerTopicOrigin" AS ENUM (
  'WEB_DISCOVERY',
  'URL_IMPORT',
  'MANUAL'
);

CREATE TABLE "AiInfluencerTopicCandidate" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "category" TEXT,
  "country" TEXT DEFAULT 'CZ',
  "region" TEXT,
  "sourceUrl" TEXT,
  "canonicalUrl" TEXT,
  "sourceName" TEXT,
  "sourcePublishedAt" TIMESTAMP(3),
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checkedAt" TIMESTAMP(3),
  "origin" "AiInfluencerTopicOrigin" NOT NULL DEFAULT 'WEB_DISCOVERY',
  "topicFingerprint" TEXT,
  "viralScore" INTEGER NOT NULL DEFAULT 0,
  "relevanceScore" INTEGER NOT NULL DEFAULT 0,
  "freshnessScore" INTEGER NOT NULL DEFAULT 0,
  "confidenceScore" INTEGER NOT NULL DEFAULT 0,
  "videoPotentialScore" INTEGER NOT NULL DEFAULT 0,
  "totalScore" INTEGER NOT NULL DEFAULT 0,
  "sourceCount" INTEGER NOT NULL DEFAULT 1,
  "trendDetected" BOOLEAN NOT NULL DEFAULT false,
  "status" "AiInfluencerTopicCandidateStatus" NOT NULL DEFAULT 'DISCOVERED',
  "scoreExplanation" TEXT,
  "evidenceJson" JSONB,
  "sourceJson" JSONB,
  "factsJson" JSONB,
  "proposedHook" TEXT,
  "proposedTitle" TEXT,
  "proposedScriptJson" JSONB,
  "mediaPlanJson" JSONB,
  "estimatedDurationSec" INTEGER,
  "dismissedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdVideoJobId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiInfluencerTopicCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiInfluencerTopicCandidate_createdVideoJobId_key" ON "AiInfluencerTopicCandidate"("createdVideoJobId");
CREATE INDEX "AiInfluencerTopicCandidate_status_totalScore_idx" ON "AiInfluencerTopicCandidate"("status", "totalScore");
CREATE INDEX "AiInfluencerTopicCandidate_canonicalUrl_idx" ON "AiInfluencerTopicCandidate"("canonicalUrl");
CREATE INDEX "AiInfluencerTopicCandidate_topicFingerprint_idx" ON "AiInfluencerTopicCandidate"("topicFingerprint");
CREATE INDEX "AiInfluencerTopicCandidate_discoveredAt_idx" ON "AiInfluencerTopicCandidate"("discoveredAt");

ALTER TABLE "AiInfluencerTopicCandidate"
  ADD CONSTRAINT "AiInfluencerTopicCandidate_createdVideoJobId_fkey"
  FOREIGN KEY ("createdVideoJobId") REFERENCES "AiInfluencerReelJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
