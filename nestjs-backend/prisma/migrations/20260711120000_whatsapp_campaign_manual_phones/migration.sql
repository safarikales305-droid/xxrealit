-- Ensure manual phone list column exists for multi-recipient WhatsApp campaigns.
ALTER TABLE "WhatsAppMarketingCampaign"
  ADD COLUMN IF NOT EXISTS "manualPhones" TEXT[] DEFAULT ARRAY[]::TEXT[];
