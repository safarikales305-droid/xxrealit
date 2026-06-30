-- CreateEnum
CREATE TYPE "ListingViewSource" AS ENUM ('SHORTS', 'CLASSIC', 'DETAIL');

-- AlterTable Property - views breakdown
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "realViews" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "manualViews" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "autopilotViews" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "viewsAutopilotEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "viewsAutopilotRatePerHour" INTEGER;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "viewsAutopilotRateMin" INTEGER;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "viewsAutopilotRateMax" INTEGER;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "viewsAutopilotIntervalMinutes" INTEGER;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "viewsAutopilotMaxPerDay" INTEGER;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "viewsAutopilotMaxTotal" INTEGER;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "lastAutopilotViewsAt" TIMESTAMP(3);
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "autopilotViewsDayKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "autopilotViewsAddedToday" INTEGER NOT NULL DEFAULT 0;

-- Migrate legacy viewsCount into manualViews
UPDATE "Property"
SET "manualViews" = GREATEST(0, COALESCE("viewsCount", 0))
WHERE "manualViews" = 0 AND COALESCE("viewsCount", 0) > 0;

-- Map legacy autopilot flag
UPDATE "Property"
SET "viewsAutopilotEnabled" = COALESCE("autoViewsEnabled", false)
WHERE "autoViewsEnabled" = true;

UPDATE "Property"
SET "lastAutopilotViewsAt" = "lastAutoViewsAt"
WHERE "lastAutopilotViewsAt" IS NULL AND "lastAutoViewsAt" IS NOT NULL;

-- AlterTable Post - likes breakdown
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "realLikes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "manualLikes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "autopilotLikes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "likesAutopilotEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "likesAutopilotRatePerHour" INTEGER;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "likesAutopilotMaxTotal" INTEGER;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "lastAutopilotLikesAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "autopilotLikesDayKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "autopilotLikesAddedToday" INTEGER NOT NULL DEFAULT 0;

-- Backfill realLikes from reactions
UPDATE "Post" p
SET "realLikes" = sub.cnt
FROM (
  SELECT "postId", COUNT(*)::int AS cnt
  FROM "PostReaction"
  WHERE type = 'LIKE'
  GROUP BY "postId"
) sub
WHERE p.id = sub."postId";

-- CreateTable ListingView
CREATE TABLE IF NOT EXISTS "ListingView" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT,
    "visitorId" TEXT,
    "source" "ListingViewSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ListingView_listingId_userId_createdAt_idx" ON "ListingView"("listingId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ListingView_listingId_visitorId_createdAt_idx" ON "ListingView"("listingId", "visitorId", "createdAt");
CREATE INDEX IF NOT EXISTS "ListingView_createdAt_idx" ON "ListingView"("createdAt");

ALTER TABLE "ListingView" DROP CONSTRAINT IF EXISTS "ListingView_listingId_fkey";
ALTER TABLE "ListingView" ADD CONSTRAINT "ListingView_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ListingView" DROP CONSTRAINT IF EXISTS "ListingView_userId_fkey";
ALTER TABLE "ListingView" ADD CONSTRAINT "ListingView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable StatisticsSettings
CREATE TABLE IF NOT EXISTS "StatisticsSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "shortsViewsAutopilotEnabled" BOOLEAN NOT NULL DEFAULT true,
    "shortsViewsRatePerHour" INTEGER NOT NULL DEFAULT 10,
    "shortsViewsRateMin" INTEGER NOT NULL DEFAULT 8,
    "shortsViewsRateMax" INTEGER NOT NULL DEFAULT 13,
    "shortsViewsIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "shortsViewsMaxPerDay" INTEGER NOT NULL DEFAULT 240,
    "shortsViewsMaxTotal" INTEGER NOT NULL DEFAULT 10000,
    "classicViewsAutopilotEnabled" BOOLEAN NOT NULL DEFAULT true,
    "classicViewsRatePerHour" INTEGER NOT NULL DEFAULT 10,
    "classicViewsRateMin" INTEGER NOT NULL DEFAULT 8,
    "classicViewsRateMax" INTEGER NOT NULL DEFAULT 13,
    "classicViewsIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "classicViewsMaxPerDay" INTEGER NOT NULL DEFAULT 240,
    "classicViewsMaxTotal" INTEGER NOT NULL DEFAULT 10000,
    "newListingBoostHours" INTEGER NOT NULL DEFAULT 24,
    "newListingBoostMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "postsLikesAutopilotEnabled" BOOLEAN NOT NULL DEFAULT true,
    "postsLikesRatePerHour" INTEGER NOT NULL DEFAULT 5,
    "postsLikesRateMin" INTEGER NOT NULL DEFAULT 3,
    "postsLikesRateMax" INTEGER NOT NULL DEFAULT 8,
    "postsLikesIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "postsLikesMaxPerDay" INTEGER NOT NULL DEFAULT 30,
    "postsLikesMaxTotal" INTEGER NOT NULL DEFAULT 500,
    "postsLikesAfter24hMax" INTEGER NOT NULL DEFAULT 30,
    "viewDedupHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatisticsSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "StatisticsSettings" ("id")
VALUES ('default')
ON CONFLICT ("id") DO NOTHING;
