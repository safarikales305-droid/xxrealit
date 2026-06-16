-- Přidání WABA ID k šablonám a unikátní kombinace (wabaId, templateName, language)
ALTER TABLE "WhatsAppMetaTemplate" ADD COLUMN IF NOT EXISTS "wabaId" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "WhatsAppMetaTemplate_wabaId_idx"
  ON "WhatsAppMetaTemplate"("wabaId");

-- Odstranění duplicit před unikátním indexem (ponechat nejnovější sync)
DELETE FROM "WhatsAppMetaTemplate" a
USING "WhatsAppMetaTemplate" b
WHERE a.id < b.id
  AND a."templateName" = b."templateName"
  AND a."language" = b."language"
  AND (a."wabaId" = b."wabaId" OR a."wabaId" = '' OR b."wabaId" = '');

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppMetaTemplate_wabaId_templateName_language_key"
  ON "WhatsAppMetaTemplate"("wabaId", "templateName", "language");
