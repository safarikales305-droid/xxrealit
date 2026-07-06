-- Meta Marketing App — samostatný OAuth token pro reklamní účet / Ads API
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "facebookMarketingAppId" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "facebookMarketingSecret" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "marketingAccessTokenEncrypted" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "marketingTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "marketingRefreshTokenEncrypted" TEXT;
