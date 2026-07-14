ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "campaignsDebugMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaLaunchDebug" JSONB;
