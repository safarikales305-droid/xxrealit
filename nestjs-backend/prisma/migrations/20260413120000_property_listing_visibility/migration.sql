-- AlterTable
ALTER TABLE "Property" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "activeFrom" TIMESTAMP(3),
ADD COLUMN "activeUntil" TIMESTAMP(3),
ADD COLUMN "listingType" TEXT NOT NULL DEFAULT 'CLASSIC';

UPDATE "Property"
SET "listingType" = 'SHORTS'
WHERE "videoUrl" IS NOT NULL AND TRIM("videoUrl") <> '';

CREATE INDEX "Property_deletedAt_isActive_approved_idx" ON "Property" ("deletedAt", "isActive", "approved");
