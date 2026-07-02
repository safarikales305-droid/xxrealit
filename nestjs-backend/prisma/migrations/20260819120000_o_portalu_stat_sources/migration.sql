-- CreateEnum
CREATE TYPE "PublicPortalStatValueSource" AS ENUM ('MANUAL', 'DATABASE', 'API');

-- AlterTable
ALTER TABLE "PublicPortalStat" ADD COLUMN "valueSource" "PublicPortalStatValueSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "PublicPortalStat" ADD COLUMN "lastFetchedAt" TIMESTAMP(3);
ALTER TABLE "PublicPortalStat" ADD COLUMN "lastFetchError" TEXT;

-- CreateTable
CREATE TABLE "PublicPortalStatImportLog" (
    "id" TEXT NOT NULL,
    "statKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedValue" DOUBLE PRECISION,
    "error" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicPortalStatImportLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublicPortalStatImportLog_statKey_createdAt_idx" ON "PublicPortalStatImportLog"("statKey", "createdAt");
CREATE INDEX "PublicPortalStatImportLog_createdAt_idx" ON "PublicPortalStatImportLog"("createdAt");

-- Seed default value sources for known stat keys
UPDATE "PublicPortalStat" SET "valueSource" = 'DATABASE' WHERE "key" IN (
  'web_visits', 'listing_views', 'reel_views', 'registered_users', 'active_listings', 'leads_sent'
);
UPDATE "PublicPortalStat" SET "valueSource" = 'API' WHERE "key" IN ('facebook_reach', 'instagram_reach');
UPDATE "PublicPortalStat" SET "valueSource" = 'MANUAL' WHERE "key" IN ('tiktok_reach', 'youtube_reach');
