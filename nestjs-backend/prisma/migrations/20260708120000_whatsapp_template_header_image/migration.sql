ALTER TABLE "WhatsAppMetaTemplate"
  ADD COLUMN IF NOT EXISTS "headerType" TEXT NOT NULL DEFAULT 'NONE';

UPDATE "WhatsAppMetaTemplate"
SET "headerType" = 'IMAGE'
WHERE "headerType" = 'NONE'
  AND "rawTemplate" IS NOT NULL
  AND "rawTemplate"::text ILIKE '%"type":"HEADER"%'
  AND "rawTemplate"::text ILIKE '%"format":"IMAGE"%';

ALTER TABLE "WhatsAppMarketingCampaign"
  ADD COLUMN IF NOT EXISTS "waHeaderImageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "waHeaderImageMediaId" TEXT;

CREATE INDEX IF NOT EXISTS "WhatsAppMetaTemplate_headerType_idx"
  ON "WhatsAppMetaTemplate"("headerType");
