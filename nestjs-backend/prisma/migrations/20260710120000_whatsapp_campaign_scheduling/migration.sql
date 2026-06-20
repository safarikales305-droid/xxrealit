ALTER TYPE "WhatsAppMarketingCampaignStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE "WhatsAppMarketingCampaignStatus" ADD VALUE IF NOT EXISTS 'PARTIAL_FAILED';

ALTER TABLE "WhatsAppMarketingCampaign"
  ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastError" TEXT;

CREATE INDEX IF NOT EXISTS "WhatsAppMarketingCampaign_status_scheduledAt_idx"
  ON "WhatsAppMarketingCampaign"("status", "scheduledAt");
