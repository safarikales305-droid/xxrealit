-- CreateEnum
CREATE TYPE "YouTubePublishJobStatus" AS ENUM (
  'QUEUED',
  'AUTHENTICATING',
  'UPLOADING',
  'PROCESSING',
  'PUBLISHED',
  'FAILED',
  'AUTH_REQUIRED',
  'QUOTA_EXCEEDED'
);

CREATE TYPE "EditorialReelOwnershipType" AS ENUM ('OWNED', 'EXTERNAL');

CREATE TYPE "ReelPlatformPublishStatus" AS ENUM (
  'SKIPPED',
  'QUEUED',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
  'AUTH_REQUIRED',
  'QUOTA_EXCEEDED'
);

-- AlterTable EditorialReelJob
ALTER TABLE "EditorialReelJob" ADD COLUMN "ownershipType" "EditorialReelOwnershipType" NOT NULL DEFAULT 'OWNED';
ALTER TABLE "EditorialReelJob" ADD COLUMN "facebookPublishStatus" "ReelPlatformPublishStatus" NOT NULL DEFAULT 'SKIPPED';
ALTER TABLE "EditorialReelJob" ADD COLUMN "youtubeVideoId" TEXT;
ALTER TABLE "EditorialReelJob" ADD COLUMN "youtubePermalink" TEXT;
ALTER TABLE "EditorialReelJob" ADD COLUMN "youtubePublishStatus" "ReelPlatformPublishStatus" NOT NULL DEFAULT 'SKIPPED';
ALTER TABLE "EditorialReelJob" ADD COLUMN "youtubePublishError" TEXT;
ALTER TABLE "EditorialReelJob" ADD COLUMN "youtubePublishedAt" TIMESTAMP(3);

-- CreateTable YouTubeOAuthConnection
CREATE TABLE "YouTubeOAuthConnection" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelTitle" TEXT NOT NULL,
    "channelHandle" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "expectedChannelId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastError" TEXT,
    "connectedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YouTubeOAuthConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "YouTubeOAuthConnection_channelId_key" ON "YouTubeOAuthConnection"("channelId");

-- CreateTable YouTubeOAuthSession
CREATE TABLE "YouTubeOAuthSession" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YouTubeOAuthSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "YouTubeOAuthSession_adminUserId_idx" ON "YouTubeOAuthSession"("adminUserId");
CREATE INDEX "YouTubeOAuthSession_expiresAt_idx" ON "YouTubeOAuthSession"("expiresAt");

-- CreateTable YouTubePublishJob
CREATE TABLE "YouTubePublishJob" (
    "id" TEXT NOT NULL,
    "reelJobId" TEXT NOT NULL,
    "status" "YouTubePublishJobStatus" NOT NULL DEFAULT 'QUEUED',
    "title" TEXT,
    "description" TEXT,
    "privacyStatus" TEXT,
    "youtubeVideoId" TEXT,
    "youtubeUrl" TEXT,
    "thumbnailUploaded" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YouTubePublishJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "YouTubePublishJob_reelJobId_key" ON "YouTubePublishJob"("reelJobId");
CREATE INDEX "YouTubePublishJob_status_createdAt_idx" ON "YouTubePublishJob"("status", "createdAt");

ALTER TABLE "YouTubePublishJob" ADD CONSTRAINT "YouTubePublishJob_reelJobId_fkey" FOREIGN KEY ("reelJobId") REFERENCES "EditorialReelJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
