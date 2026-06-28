-- CreateEnum
CREATE TYPE "SocialPublishRepeatType" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM_DAYS');

-- CreateEnum
CREATE TYPE "SocialPublishScheduleLastStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SocialPublishTriggerSource" AS ENUM ('MANUAL', 'SCHEDULE', 'AUTO');

-- AlterTable
ALTER TABLE "SocialPublishQueue" ADD COLUMN "triggerSource" "SocialPublishTriggerSource" NOT NULL DEFAULT 'AUTO';
ALTER TABLE "SocialPublishQueue" ADD COLUMN "triggeredByUserId" TEXT;
ALTER TABLE "SocialPublishQueue" ADD COLUMN "scheduleId" TEXT;

-- CreateTable
CREATE TABLE "SocialPublishSchedule" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL DEFAULT 'FACEBOOK',
    "contentType" "SocialPublishContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "repeatType" "SocialPublishRepeatType" NOT NULL DEFAULT 'NONE',
    "repeatIntervalDays" INTEGER,
    "repeatUntil" TIMESTAMP(3),
    "maxRuns" INTEGER,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "requireActive" BOOLEAN NOT NULL DEFAULT true,
    "requireApproved" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" "SocialPublishScheduleLastStatus",
    "lastError" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPublishSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPublishLog" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL DEFAULT 'FACEBOOK',
    "contentType" "SocialPublishContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "queueId" TEXT,
    "status" "SocialPublishStatus" NOT NULL,
    "externalPostId" TEXT,
    "publishedUrl" TEXT,
    "lastError" TEXT,
    "triggerSource" "SocialPublishTriggerSource" NOT NULL,
    "triggeredByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPublishLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialPublishSchedule_platform_contentType_contentId_key" ON "SocialPublishSchedule"("platform", "contentType", "contentId");

-- CreateIndex
CREATE INDEX "SocialPublishSchedule_enabled_nextRunAt_idx" ON "SocialPublishSchedule"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "SocialPublishSchedule_contentType_contentId_idx" ON "SocialPublishSchedule"("contentType", "contentId");

-- CreateIndex
CREATE INDEX "SocialPublishLog_contentType_contentId_createdAt_idx" ON "SocialPublishLog"("contentType", "contentId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialPublishLog_queueId_idx" ON "SocialPublishLog"("queueId");

-- CreateIndex
CREATE INDEX "SocialPublishLog_triggeredByUserId_idx" ON "SocialPublishLog"("triggeredByUserId");

-- CreateIndex
CREATE INDEX "SocialPublishQueue_scheduleId_idx" ON "SocialPublishQueue"("scheduleId");

-- AddForeignKey
ALTER TABLE "SocialPublishQueue" ADD CONSTRAINT "SocialPublishQueue_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "SocialPublishSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPublishSchedule" ADD CONSTRAINT "SocialPublishSchedule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPublishLog" ADD CONSTRAINT "SocialPublishLog_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "SocialPublishQueue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPublishLog" ADD CONSTRAINT "SocialPublishLog_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
