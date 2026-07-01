-- CreateEnum
CREATE TYPE "TikTokPublishJobStatus" AS ENUM ('WAITING', 'UPLOADING', 'UPLOADED', 'FAILED', 'NEEDS_REAUTH');

-- CreateTable
CREATE TABLE "TikTokConnection" (
    "id" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3),
    "accountName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TikTokConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TikTokOAuthSession" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TikTokOAuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TikTokPublishJob" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT NOT NULL,
    "status" "TikTokPublishJobStatus" NOT NULL DEFAULT 'WAITING',
    "tiktokPublishId" TEXT,
    "tiktokVideoUrl" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "isDraftInbox" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TikTokPublishJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TikTokPublishLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TikTokPublishLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TikTokConnection_openId_key" ON "TikTokConnection"("openId");

-- CreateIndex
CREATE INDEX "TikTokOAuthSession_adminUserId_idx" ON "TikTokOAuthSession"("adminUserId");

-- CreateIndex
CREATE INDEX "TikTokOAuthSession_expiresAt_idx" ON "TikTokOAuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "TikTokPublishJob_status_createdAt_idx" ON "TikTokPublishJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TikTokPublishJob_listingId_createdAt_idx" ON "TikTokPublishJob"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "TikTokPublishLog_jobId_createdAt_idx" ON "TikTokPublishLog"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "TikTokPublishLog_listingId_createdAt_idx" ON "TikTokPublishLog"("listingId", "createdAt");

-- AddForeignKey
ALTER TABLE "TikTokPublishLog" ADD CONSTRAINT "TikTokPublishLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TikTokPublishJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
