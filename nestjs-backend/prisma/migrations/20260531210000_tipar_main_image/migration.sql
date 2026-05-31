-- AlterTable
ALTER TABLE "TiparPost" ADD COLUMN "mainImage" TEXT;

-- Backfill from first gallery image
UPDATE "TiparPost"
SET "mainImage" = "images"[1]
WHERE "mainImage" IS NULL
  AND array_length("images", 1) > 0;
