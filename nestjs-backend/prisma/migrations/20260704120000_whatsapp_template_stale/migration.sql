ALTER TABLE "WhatsAppMetaTemplate"
  ADD COLUMN IF NOT EXISTS "isStale" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "WhatsAppMetaTemplate_isStale_idx"
  ON "WhatsAppMetaTemplate"("isStale");
