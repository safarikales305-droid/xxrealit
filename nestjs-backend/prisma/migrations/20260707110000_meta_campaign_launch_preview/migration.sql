-- AlterTable
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "creativePreviewUrl" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "previewHtml" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaLaunchSteps" JSONB;
