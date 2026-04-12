-- CreateEnum
CREATE TYPE "ShortsListingStatus" AS ENUM ('draft', 'ready', 'published');

-- AlterTable Property
ALTER TABLE "Property" ADD COLUMN "publishedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ShortsListing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceListingId" TEXT NOT NULL,
    "publishedPropertyId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coverImage" TEXT,
    "musicUrl" TEXT NOT NULL DEFAULT '',
    "musicTrackId" TEXT,
    "musicBuiltinKey" TEXT NOT NULL DEFAULT 'demo_soft',
    "videoUrl" TEXT,
    "renderData" JSONB,
    "status" "ShortsListingStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShortsListing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShortsListing_publishedPropertyId_key" ON "ShortsListing"("publishedPropertyId");

CREATE INDEX "ShortsListing_userId_status_idx" ON "ShortsListing"("userId", "status");

CREATE INDEX "ShortsListing_sourceListingId_idx" ON "ShortsListing"("sourceListingId");

CREATE TABLE "ShortsMediaItem" (
    "id" TEXT NOT NULL,
    "shortsListingId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortsMediaItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShortsMediaItem_shortsListingId_order_idx" ON "ShortsMediaItem"("shortsListingId", "order");

CREATE INDEX "Property_listingType_publishedAt_idx" ON "Property"("listingType", "publishedAt");

ALTER TABLE "ShortsListing" ADD CONSTRAINT "ShortsListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShortsListing" ADD CONSTRAINT "ShortsListing_sourceListingId_fkey" FOREIGN KEY ("sourceListingId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShortsListing" ADD CONSTRAINT "ShortsListing_publishedPropertyId_fkey" FOREIGN KEY ("publishedPropertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShortsMediaItem" ADD CONSTRAINT "ShortsMediaItem_shortsListingId_fkey" FOREIGN KEY ("shortsListingId") REFERENCES "ShortsListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
