-- AlterEnum
ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'visualization_marketing_eligible';
ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'visualization_reel_queued';
ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'visualization_reel_rendered';
ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'visualization_reel_published';
ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'visualization_reel_failed';
ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'visualization_reel_click';
ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'visualization_reel_new_visualization';
ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'visualization_reel_lead';

CREATE TYPE "AiVisualizationMarketingPublishMode" AS ENUM ('IMMEDIATE', 'SCHEDULED');
CREATE TYPE "AiVisualizationMarketingReelStatus" AS ENUM (
  'QUEUED', 'RENDERING', 'READY', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED',
  'SKIPPED', 'SKIPPED_NO_CONSENT', 'WAITING_FOR_FACEBOOK', 'CANCELLED'
);

ALTER TABLE "AiVisualizationSettings" ADD COLUMN IF NOT EXISTS "marketingReelsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiVisualizationSettings" ADD COLUMN IF NOT EXISTS "marketingPublishFacebook" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiVisualizationSettings" ADD COLUMN IF NOT EXISTS "marketingPublishInstagram" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiVisualizationSettings" ADD COLUMN IF NOT EXISTS "marketingShowEstimateInReel" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiVisualizationSettings" ADD COLUMN IF NOT EXISTS "marketingShowContractorsInReel" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiVisualizationSettings" ADD COLUMN IF NOT EXISTS "marketingPublishEachVariant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiVisualizationSettings" ADD COLUMN IF NOT EXISTS "marketingMaxReelsPerDay" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "AiVisualizationSettings" ADD COLUMN IF NOT EXISTS "marketingMinIntervalMinutes" INTEGER NOT NULL DEFAULT 120;
ALTER TABLE "AiVisualizationSettings" ADD COLUMN IF NOT EXISTS "marketingPublishMode" "AiVisualizationMarketingPublishMode" NOT NULL DEFAULT 'SCHEDULED';
ALTER TABLE "AiVisualizationSettings" ADD COLUMN IF NOT EXISTS "marketingMusicEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiVisualizationSettings" ADD COLUMN IF NOT EXISTS "marketingMusicVolumePercent" INTEGER NOT NULL DEFAULT 12;

ALTER TABLE "AiVisualization" ADD COLUMN IF NOT EXISTS "marketingConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiVisualization" ADD COLUMN IF NOT EXISTS "marketingConsentAt" TIMESTAMP(3);
ALTER TABLE "AiVisualization" ADD COLUMN IF NOT EXISTS "marketingConsentVersion" TEXT;

CREATE TABLE "AiVisualizationMarketingReel" (
    "id" TEXT NOT NULL,
    "visualizationId" TEXT NOT NULL,
    "rootSessionId" TEXT NOT NULL,
    "status" "AiVisualizationMarketingReelStatus" NOT NULL DEFAULT 'QUEUED',
    "scheduledPublishAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "videoCloudinaryId" TEXT,
    "videoUrl" TEXT,
    "facebookPostId" TEXT,
    "facebookPermalink" TEXT,
    "facebookCaption" TEXT,
    "copyVariant" TEXT,
    "estimateMin" INTEGER,
    "estimateMax" INTEGER,
    "contractorCount" INTEGER,
    "lastError" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "renderStartedAt" TIMESTAMP(3),
    "renderCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiVisualizationMarketingReel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiVisualizationMarketingReel_visualizationId_key" ON "AiVisualizationMarketingReel"("visualizationId");
CREATE INDEX "AiVisualizationMarketingReel_status_scheduledPublishAt_idx" ON "AiVisualizationMarketingReel"("status", "scheduledPublishAt");
CREATE INDEX "AiVisualizationMarketingReel_rootSessionId_idx" ON "AiVisualizationMarketingReel"("rootSessionId");
CREATE INDEX "AiVisualizationMarketingReel_publishedAt_idx" ON "AiVisualizationMarketingReel"("publishedAt");

ALTER TABLE "AiVisualizationMarketingReel" ADD CONSTRAINT "AiVisualizationMarketingReel_visualizationId_fkey" FOREIGN KEY ("visualizationId") REFERENCES "AiVisualization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
