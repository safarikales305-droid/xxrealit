-- CreateEnum
CREATE TYPE "EditorialReelJobStatus" AS ENUM ('DRAFT', 'QUEUED', 'RENDERING', 'READY', 'PUBLISHING', 'PUBLISHED', 'FAILED');
CREATE TYPE "ReelNarrationMode" AS ENUM ('NONE', 'MUSIC', 'AI_VOICE', 'AI_AVATAR');
CREATE TYPE "ReelTransitionStyle" AS ENUM ('FADE', 'ZOOM', 'SLIDE', 'CROSSFADE');

-- AlterTable NewsSource
ALTER TABLE "NewsSource" ADD COLUMN "contentCategoryId" TEXT;
ALTER TABLE "NewsSource" ADD COLUMN "youtubeAutoImport" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NewsSource" ADD COLUMN "youtubePublishToShorts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NewsSource" ADD COLUMN "youtubeUseForReel" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NewsSource" ADD COLUMN "lastAutoImportedAt" TIMESTAMP(3);
ALTER TABLE "NewsSource" ADD COLUMN "lastPublishedToShortsAt" TIMESTAMP(3);

-- AlterTable Post
ALTER TABLE "Post" ADD COLUMN "lastUsedInReelAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN "reelUsageCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Post" ADD COLUMN "hiddenFromShorts" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable ContentSourceCategory
CREATE TABLE "ContentSourceCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentSourceCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentSourceCategory_slug_key" ON "ContentSourceCategory"("slug");

-- CreateTable EditorialReelMusicTrack
CREATE TABLE "EditorialReelMusicTrack" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "durationSec" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EditorialReelMusicTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable EditorialReelTemplate
CREATE TABLE "EditorialReelTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "introSec" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "segmentSec" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "outroSec" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "videosPerReel" INTEGER NOT NULL DEFAULT 5,
    "transition" "ReelTransitionStyle" NOT NULL DEFAULT 'FADE',
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showVideoTitle" BOOLEAN NOT NULL DEFAULT true,
    "showChannelTitle" BOOLEAN NOT NULL DEFAULT true,
    "showCategory" BOOLEAN NOT NULL DEFAULT true,
    "ctaText" TEXT NOT NULL DEFAULT 'Další videa najdete na XXREALIT.cz',
    "introText" TEXT,
    "musicTrackId" TEXT,
    "narrationMode" "ReelNarrationMode" NOT NULL DEFAULT 'MUSIC',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EditorialReelTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable ShortsCollection
CREATE TABLE "ShortsCollection" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'facebook-reel',
    "slug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShortsCollection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShortsCollection_slug_key" ON "ShortsCollection"("slug");

-- CreateTable EditorialReelJob
CREATE TABLE "EditorialReelJob" (
    "id" TEXT NOT NULL,
    "status" "EditorialReelJobStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "templateId" TEXT,
    "categoryId" TEXT,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "renderError" TEXT,
    "publishError" TEXT,
    "videoPath" TEXT,
    "videoUrl" TEXT,
    "facebookPostId" TEXT,
    "facebookPermalink" TEXT,
    "shortsCollectionId" TEXT,
    "dedupeKey" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "renderedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EditorialReelJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EditorialReelJob_dedupeKey_key" ON "EditorialReelJob"("dedupeKey");
CREATE INDEX "EditorialReelJob_status_createdAt_idx" ON "EditorialReelJob"("status", "createdAt");
CREATE INDEX "EditorialReelJob_categoryId_status_idx" ON "EditorialReelJob"("categoryId", "status");

-- CreateTable EditorialReelSegment
CREATE TABLE "EditorialReelSegment" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "thumbnailUrl" TEXT,
    "title" TEXT,
    "channelTitle" TEXT,
    "categoryLabel" TEXT,
    CONSTRAINT "EditorialReelSegment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EditorialReelSegment_jobId_sortOrder_idx" ON "EditorialReelSegment"("jobId", "sortOrder");
CREATE INDEX "EditorialReelSegment_postId_idx" ON "EditorialReelSegment"("postId");

-- CreateTable ShortsCollectionItem
CREATE TABLE "ShortsCollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "postId" TEXT,
    "feedKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ShortsCollectionItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShortsCollectionItem_collectionId_sortOrder_idx" ON "ShortsCollectionItem"("collectionId", "sortOrder");
CREATE INDEX "ShortsCollectionItem_feedKey_idx" ON "ShortsCollectionItem"("feedKey");

-- AddForeignKey
ALTER TABLE "NewsSource" ADD CONSTRAINT "NewsSource_contentCategoryId_fkey" FOREIGN KEY ("contentCategoryId") REFERENCES "ContentSourceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EditorialReelTemplate" ADD CONSTRAINT "EditorialReelTemplate_musicTrackId_fkey" FOREIGN KEY ("musicTrackId") REFERENCES "EditorialReelMusicTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EditorialReelJob" ADD CONSTRAINT "EditorialReelJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EditorialReelTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EditorialReelJob" ADD CONSTRAINT "EditorialReelJob_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ContentSourceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EditorialReelJob" ADD CONSTRAINT "EditorialReelJob_shortsCollectionId_fkey" FOREIGN KEY ("shortsCollectionId") REFERENCES "ShortsCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EditorialReelSegment" ADD CONSTRAINT "EditorialReelSegment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "EditorialReelJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditorialReelSegment" ADD CONSTRAINT "EditorialReelSegment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShortsCollectionItem" ADD CONSTRAINT "ShortsCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ShortsCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShortsCollectionItem" ADD CONSTRAINT "ShortsCollectionItem_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
