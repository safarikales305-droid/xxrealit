-- AI Influencer reel master + publish pipeline
ALTER TABLE "AiInfluencerProfile" ADD COLUMN IF NOT EXISTS "renderPreset" TEXT DEFAULT 'modern_xxrealit';
ALTER TABLE "AiInfluencerProfile" ADD COLUMN IF NOT EXISTS "renderSettingsJson" JSONB;

ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "finalMasterUrl" TEXT;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "renderPreset" TEXT;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "renderSettingsJson" JSONB;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "validationPassed" BOOLEAN;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "validationErrors" JSONB;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "timelineEvents" JSONB;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "facebookPublishStatus" "ReelPlatformPublishStatus" NOT NULL DEFAULT 'SKIPPED';
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "facebookPostId" TEXT;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "facebookPermalink" TEXT;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "facebookPublishedAt" TIMESTAMP(3);
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "facebookPublishError" TEXT;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "youtubePublishStatus" "ReelPlatformPublishStatus" NOT NULL DEFAULT 'SKIPPED';
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "youtubeVideoId" TEXT;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "youtubePermalink" TEXT;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "youtubePublishedAt" TIMESTAMP(3);
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "youtubePublishError" TEXT;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "youtubePrivacyStatus" TEXT;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
