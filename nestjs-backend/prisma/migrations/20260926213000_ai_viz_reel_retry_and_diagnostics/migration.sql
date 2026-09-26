ALTER TYPE "AiVisualizationMarketingReelStatus" ADD VALUE IF NOT EXISTS 'RETRY_WAIT';

ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'ai_visualization_seo_cta_click';

ALTER TABLE "AiVisualizationMarketingReel" ADD COLUMN IF NOT EXISTS "failurePhase" TEXT;
ALTER TABLE "AiVisualizationMarketingReel" ADD COLUMN IF NOT EXISTS "metaErrorCode" INTEGER;
ALTER TABLE "AiVisualizationMarketingReel" ADD COLUMN IF NOT EXISTS "metaErrorSubcode" INTEGER;
ALTER TABLE "AiVisualizationMarketingReel" ADD COLUMN IF NOT EXISTS "httpStatus" INTEGER;
ALTER TABLE "AiVisualizationMarketingReel" ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "AiVisualizationMarketingReel" ADD COLUMN IF NOT EXISTS "publishStartedAt" TIMESTAMP(3);

ALTER TABLE "AiVisualizationSettings" ADD COLUMN IF NOT EXISTS "marketingCtaPath" TEXT NOT NULL DEFAULT '/ai-vizualizace';
ALTER TABLE "AiVisualizationSettings" ADD COLUMN IF NOT EXISTS "marketingBrandingEnabled" BOOLEAN NOT NULL DEFAULT true;
