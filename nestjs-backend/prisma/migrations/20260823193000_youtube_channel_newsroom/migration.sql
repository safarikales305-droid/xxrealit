-- PostSource: YOUTUBE
ALTER TYPE "PostSource" ADD VALUE IF NOT EXISTS 'YOUTUBE';

-- NewsSourceType: YOUTUBE_CHANNEL
ALTER TYPE "NewsSourceType" ADD VALUE IF NOT EXISTS 'YOUTUBE_CHANNEL';

-- NewsYoutubePublishMode
DO $$ BEGIN
  CREATE TYPE "NewsYoutubePublishMode" AS ENUM ('RELEVANT_ONLY', 'ALL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Post YouTube fields
ALTER TABLE "Post"
  ADD COLUMN IF NOT EXISTS "youtubeVideoId" TEXT,
  ADD COLUMN IF NOT EXISTS "youtubeChannelId" TEXT,
  ADD COLUMN IF NOT EXISTS "youtubeChannelTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "youtubeThumbnailUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "youtubeEmbeddable" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS "Post_youtubeVideoId_key" ON "Post"("youtubeVideoId");

-- NewsSource YouTube fields
ALTER TABLE "NewsSource"
  ADD COLUMN IF NOT EXISTS "channelId" TEXT,
  ADD COLUMN IF NOT EXISTS "youtubePublishMode" "NewsYoutubePublishMode" NOT NULL DEFAULT 'RELEVANT_ONLY',
  ADD COLUMN IF NOT EXISTS "youtubeCreatePost" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "youtubeFacebookPost" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "minRelevanceScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastVideoPublishedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastVideoId" TEXT,
  ADD COLUMN IF NOT EXISTS "youtubeImportedCount" INTEGER NOT NULL DEFAULT 0;
