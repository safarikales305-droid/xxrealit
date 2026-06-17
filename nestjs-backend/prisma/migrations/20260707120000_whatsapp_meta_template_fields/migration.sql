-- WhatsAppMetaTemplate: wabaId, status fields, usable, rawTemplate (JSON), lastSyncedAt
ALTER TABLE "WhatsAppMetaTemplate" ADD COLUMN IF NOT EXISTS "wabaId" TEXT;
ALTER TABLE "WhatsAppMetaTemplate" ADD COLUMN IF NOT EXISTS "rawStatus" TEXT;
ALTER TABLE "WhatsAppMetaTemplate" ADD COLUMN IF NOT EXISTS "normalizedStatus" TEXT;
ALTER TABLE "WhatsAppMetaTemplate" ADD COLUMN IF NOT EXISTS "usable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WhatsAppMetaTemplate" ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP(3);

-- Backfill status fields from legacy status column
UPDATE "WhatsAppMetaTemplate"
SET
  "rawStatus" = COALESCE("rawStatus", "status"),
  "normalizedStatus" = COALESCE("normalizedStatus", UPPER("status"))
WHERE "rawStatus" IS NULL OR "normalizedStatus" IS NULL;

-- Backfill usable from normalized status
UPDATE "WhatsAppMetaTemplate"
SET "usable" = true
WHERE UPPER(COALESCE("normalizedStatus", "status", '')) IN ('APPROVED', 'ACTIVE');

-- Migrate syncedAt -> lastSyncedAt
UPDATE "WhatsAppMetaTemplate"
SET "lastSyncedAt" = "syncedAt"
WHERE "lastSyncedAt" IS NULL
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'WhatsAppMetaTemplate'
      AND column_name = 'syncedAt'
  );

ALTER TABLE "WhatsAppMetaTemplate" DROP COLUMN IF EXISTS "syncedAt";

-- wabaId optional (legacy rows may have empty string)
ALTER TABLE "WhatsAppMetaTemplate" ALTER COLUMN "wabaId" DROP NOT NULL;
ALTER TABLE "WhatsAppMetaTemplate" ALTER COLUMN "wabaId" DROP DEFAULT;
UPDATE "WhatsAppMetaTemplate" SET "wabaId" = NULL WHERE "wabaId" = '';

-- rawTemplate: TEXT -> JSONB
ALTER TABLE "WhatsAppMetaTemplate" ADD COLUMN IF NOT EXISTS "rawTemplate" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'WhatsAppMetaTemplate'
      AND column_name = 'rawTemplate'
      AND udt_name = 'text'
  ) THEN
    ALTER TABLE "WhatsAppMetaTemplate"
      ALTER COLUMN "rawTemplate" TYPE JSONB
      USING (
        CASE
          WHEN "rawTemplate" IS NULL OR BTRIM("rawTemplate") = '' THEN NULL
          ELSE "rawTemplate"::jsonb
        END
      );
  END IF;
END $$;

-- Unique: wabaId + templateName + language
DELETE FROM "WhatsAppMetaTemplate" a
USING "WhatsAppMetaTemplate" b
WHERE a.id < b.id
  AND a."templateName" = b."templateName"
  AND a."language" = b."language"
  AND (
    a."wabaId" IS NOT DISTINCT FROM b."wabaId"
    OR COALESCE(a."wabaId", '') = ''
    OR COALESCE(b."wabaId", '') = ''
  );

DROP INDEX IF EXISTS "WhatsAppMetaTemplate_wabaId_templateName_language_key";
CREATE UNIQUE INDEX "WhatsAppMetaTemplate_wabaId_templateName_language_key"
  ON "WhatsAppMetaTemplate"("wabaId", "templateName", "language");

CREATE INDEX IF NOT EXISTS "WhatsAppMetaTemplate_wabaId_idx"
  ON "WhatsAppMetaTemplate"("wabaId");

CREATE INDEX IF NOT EXISTS "WhatsAppMetaTemplate_normalizedStatus_idx"
  ON "WhatsAppMetaTemplate"("normalizedStatus");

CREATE INDEX IF NOT EXISTS "WhatsAppMetaTemplate_usable_idx"
  ON "WhatsAppMetaTemplate"("usable");
