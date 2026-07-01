ALTER TABLE "SocialPublishLog" ADD COLUMN IF NOT EXISTS "introVideoIdUsed" TEXT;
ALTER TABLE "SocialPublishLog" ADD COLUMN IF NOT EXISTS "introVideoTitle" TEXT;
ALTER TABLE "SocialPublishLog" ADD COLUMN IF NOT EXISTS "sourceListingVideoUrl" TEXT;
ALTER TABLE "SocialPublishLog" ADD COLUMN IF NOT EXISTS "finalVideoUrl" TEXT;
ALTER TABLE "SocialPublishLog" ADD COLUMN IF NOT EXISTS "finalVideoGeneratedAt" TIMESTAMPTZ;

ALTER TABLE "SocialPublishSchedule" ADD COLUMN IF NOT EXISTS "lastIntroVideoUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SocialPublishSchedule" ADD COLUMN IF NOT EXISTS "lastIntroVideoIdUsed" TEXT;
ALTER TABLE "SocialPublishSchedule" ADD COLUMN IF NOT EXISTS "lastIntroVideoTitle" TEXT;
ALTER TABLE "SocialPublishSchedule" ADD COLUMN IF NOT EXISTS "lastSourceListingVideoUrl" TEXT;
ALTER TABLE "SocialPublishSchedule" ADD COLUMN IF NOT EXISTS "lastFinalVideoUrl" TEXT;
ALTER TABLE "SocialPublishSchedule" ADD COLUMN IF NOT EXISTS "lastFinalVideoGeneratedAt" TIMESTAMPTZ;
ALTER TABLE "SocialPublishSchedule" ADD COLUMN IF NOT EXISTS "lastTotalReelDurationSec" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "SocialReelCompositionCache" (
  "id" TEXT NOT NULL,
  "cacheKey" TEXT NOT NULL,
  "introVideoId" TEXT NOT NULL,
  "introVideoUpdatedAt" TIMESTAMPTZ NOT NULL,
  "sourceListingVideoUrl" TEXT NOT NULL,
  "listingTeaserSeconds" DOUBLE PRECISION NOT NULL,
  "finalVideoUrl" TEXT NOT NULL,
  "finalVideoSizeBytes" INTEGER,
  "totalDurationSec" DOUBLE PRECISION,
  "ffmpegCommand" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialReelCompositionCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SocialReelCompositionCache_cacheKey_key" ON "SocialReelCompositionCache"("cacheKey");
CREATE INDEX IF NOT EXISTS "SocialReelCompositionCache_introVideoId_idx" ON "SocialReelCompositionCache"("introVideoId");
CREATE INDEX IF NOT EXISTS "SocialReelCompositionCache_sourceListingVideoUrl_idx" ON "SocialReelCompositionCache"("sourceListingVideoUrl");

DO $$ BEGIN
  ALTER TABLE "SocialReelCompositionCache"
    ADD CONSTRAINT "SocialReelCompositionCache_introVideoId_fkey"
    FOREIGN KEY ("introVideoId") REFERENCES "SocialIntroVideo"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
