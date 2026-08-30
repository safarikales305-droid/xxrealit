-- CreateEnum
CREATE TYPE "ReelHookMode" AS ENUM ('TEMPLATE', 'AI', 'AI_FALLBACK');
CREATE TYPE "YoutubeSourceSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'IGNORED');

-- AlterTable EditorialReelTemplate
ALTER TABLE "EditorialReelTemplate" ADD COLUMN IF NOT EXISTS "hookMode" "ReelHookMode" NOT NULL DEFAULT 'AI_FALLBACK';
ALTER TABLE "EditorialReelTemplate" ADD COLUMN IF NOT EXISTS "generateHookText" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "EditorialReelTemplate" ADD COLUMN IF NOT EXISTS "useFirstVideoAsIntro" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "EditorialReelTemplate" ADD COLUMN IF NOT EXISTS "showFirstVideoTitle" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable YouTubeSourceSuggestion
CREATE TABLE IF NOT EXISTS "YouTubeSourceSuggestion" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelTitle" TEXT NOT NULL,
    "channelUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "subscriberCount" INTEGER,
    "videoCount" INTEGER,
    "lastVideoAt" TIMESTAMP(3),
    "relevanceScore" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "status" "YoutubeSourceSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "suggestedBy" TEXT NOT NULL DEFAULT 'ai_discovery',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "createdSourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YouTubeSourceSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "YouTubeSourceSuggestion_channelId_categoryId_key" ON "YouTubeSourceSuggestion"("channelId", "categoryId");
CREATE INDEX IF NOT EXISTS "YouTubeSourceSuggestion_status_relevanceScore_idx" ON "YouTubeSourceSuggestion"("status", "relevanceScore");
CREATE INDEX IF NOT EXISTS "YouTubeSourceSuggestion_categoryId_status_idx" ON "YouTubeSourceSuggestion"("categoryId", "status");

ALTER TABLE "YouTubeSourceSuggestion" ADD CONSTRAINT "YouTubeSourceSuggestion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ContentSourceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
