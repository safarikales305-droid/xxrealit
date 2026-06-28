-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'TIKTOK');

-- CreateEnum
CREATE TYPE "SocialPublishContentType" AS ENUM ('POST', 'PROPERTY', 'SHORT');

-- CreateEnum
CREATE TYPE "SocialPublishStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "SocialPublishQueue" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL DEFAULT 'FACEBOOK',
    "contentType" "SocialPublishContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "contentTitle" TEXT NOT NULL DEFAULT '',
    "status" "SocialPublishStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "publishedUrl" TEXT,
    "externalPostId" TEXT,
    "lastApiResponse" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPublishQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialPublishQueue_platform_contentType_contentId_key" ON "SocialPublishQueue"("platform", "contentType", "contentId");

-- CreateIndex
CREATE INDEX "SocialPublishQueue_status_scheduledAt_idx" ON "SocialPublishQueue"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "SocialPublishQueue_status_createdAt_idx" ON "SocialPublishQueue"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SocialPublishQueue_contentType_contentId_idx" ON "SocialPublishQueue"("contentType", "contentId");

-- CreateIndex
CREATE INDEX "SocialPublishQueue_authorUserId_idx" ON "SocialPublishQueue"("authorUserId");

-- AddForeignKey
ALTER TABLE "SocialPublishQueue" ADD CONSTRAINT "SocialPublishQueue_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
