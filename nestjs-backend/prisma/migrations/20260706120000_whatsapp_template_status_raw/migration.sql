ALTER TABLE "WhatsAppMetaTemplate"
  ADD COLUMN IF NOT EXISTS "rawStatus" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "normalizedStatus" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "rawTemplate" TEXT;

UPDATE "WhatsAppMetaTemplate"
SET
  "rawStatus" = COALESCE(NULLIF("rawStatus", ''), "status"),
  "normalizedStatus" = COALESCE(NULLIF("normalizedStatus", ''), UPPER("status"))
WHERE "rawStatus" = '' OR "normalizedStatus" = '';

CREATE INDEX IF NOT EXISTS "WhatsAppMetaTemplate_normalizedStatus_idx"
  ON "WhatsAppMetaTemplate"("normalizedStatus");
