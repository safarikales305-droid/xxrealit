ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "campaignsLiveEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaStatus" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaEffectiveStatus" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaInsights" JSONB;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaLaunchedAt" TIMESTAMP(3);
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaStatusSyncedAt" TIMESTAMP(3);
