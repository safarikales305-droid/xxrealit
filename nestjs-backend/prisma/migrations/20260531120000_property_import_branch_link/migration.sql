-- AlterTable
ALTER TABLE "Property" ADD COLUMN "importSourceId" TEXT;
ALTER TABLE "Property" ADD COLUMN "hiddenByImportDisabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Property_importSourceId_idx" ON "Property"("importSourceId");
CREATE INDEX "Property_hiddenByImportDisabled_isActive_idx" ON "Property"("hiddenByImportDisabled", "isActive");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_importSourceId_fkey" FOREIGN KEY ("importSourceId") REFERENCES "ImportSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill vazby na importní větev podle portálu + metody + kategorie
UPDATE "Property" AS p
SET "importSourceId" = s.id
FROM "ImportSource" AS s
WHERE p."importSourceId" IS NULL
  AND p."importSource" IS NOT NULL
  AND p."importSource"::text = s.portal::text
  AND p."importMethod"::text = s.method::text
  AND p."importCategoryKey" = s."categoryKey"
  AND p."sourcePortalKey" = s."portalKey";

-- Skryj inzeráty z větví, které jsou už vypnuté
UPDATE "Property" AS p
SET "hiddenByImportDisabled" = true,
    "isActive" = false
FROM "ImportSource" AS s
WHERE p."importSourceId" = s.id
  AND s.enabled = false
  AND p."importDisabled" = false
  AND p."hiddenByImportDisabled" = false;
