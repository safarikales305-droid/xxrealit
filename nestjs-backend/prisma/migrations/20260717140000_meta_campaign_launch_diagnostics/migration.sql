-- Meta campaign draft: launch diagnostics for pending verification / resume
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "launchStatus" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "failedStep" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaErrorCode" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaErrorSubcode" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaErrorTitle" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaErrorMessage" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaTraceId" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "pendingMetaVerification" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "lastPreflightAt" TIMESTAMP(3);
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "lastLaunchAttemptAt" TIMESTAMP(3);
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "launchLockUntil" TIMESTAMP(3);
