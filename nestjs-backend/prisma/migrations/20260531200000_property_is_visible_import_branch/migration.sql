-- AlterTable
ALTER TABLE "Property" ADD COLUMN "isVisible" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Property_isVisible_isActive_idx" ON "Property"("isVisible", "isActive");

-- Skryj importované inzeráty bez aktivní větve (jednorázový backfill)
UPDATE "Property" AS p
SET
  "isVisible" = false,
  "isActive" = false,
  "status" = 'HIDDEN',
  "hiddenByImportDisabled" = true
WHERE p."importSource" IS NOT NULL
  AND (
    p."importSourceId" IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM "ImportSource" AS s
      WHERE s.id = p."importSourceId"
        AND s.enabled = true
        AND s."isActive" = true
        AND s."deletedAt" IS NULL
        AND s."isDeleted" = false
    )
  );
