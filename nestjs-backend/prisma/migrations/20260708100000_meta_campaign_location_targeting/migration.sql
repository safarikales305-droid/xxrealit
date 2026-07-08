ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "locationTargetingMode" TEXT NOT NULL DEFAULT 'city';
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaLaunchPayloads" JSONB;
