ALTER TABLE "WhatsAppMarketingCampaignLog"
  ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT;

CREATE INDEX IF NOT EXISTS "WhatsAppMarketingCampaignLog_providerMessageId_idx"
  ON "WhatsAppMarketingCampaignLog"("providerMessageId");
