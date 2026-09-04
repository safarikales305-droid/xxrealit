-- AI Influencer: samostatné Instagram Reels publikování
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "instagramPublishStatus" "ReelPlatformPublishStatus" NOT NULL DEFAULT 'SKIPPED';
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "instagramMediaId" TEXT;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "instagramPermalink" TEXT;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "instagramUsername" TEXT;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "instagramPublishedAt" TIMESTAMP(3);
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "instagramPublishError" TEXT;
