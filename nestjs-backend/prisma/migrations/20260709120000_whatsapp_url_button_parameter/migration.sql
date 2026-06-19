-- WhatsApp URL button parameter for campaigns and template sync metadata
ALTER TABLE "WhatsAppMetaTemplate"
  ADD COLUMN IF NOT EXISTS "urlButtonParamCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "WhatsAppMarketingCampaign"
  ADD COLUMN IF NOT EXISTS "waUrlButtonParameter" TEXT;
