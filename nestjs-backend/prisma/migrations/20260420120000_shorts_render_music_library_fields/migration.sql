-- Shorts video render lifecycle + music library metadata
CREATE TYPE "ShortsVideoRenderStatus" AS ENUM ('idle', 'rendering', 'failed');

ALTER TABLE "ShortsListing"
ADD COLUMN "videoRenderStatus" "ShortsVideoRenderStatus" NOT NULL DEFAULT 'idle',
ADD COLUMN "videoRenderError" TEXT,
ADD COLUMN "renderVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ShortsMusicTrack"
ADD COLUMN "artist" TEXT NOT NULL DEFAULT '',
ADD COLUMN "previewUrl" TEXT;
