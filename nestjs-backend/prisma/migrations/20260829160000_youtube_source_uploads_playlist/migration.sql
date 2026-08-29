-- AlterTable
ALTER TABLE "NewsSource" ADD COLUMN IF NOT EXISTS "uploadsPlaylistId" TEXT;
ALTER TABLE "NewsSource" ADD COLUMN IF NOT EXISTS "youtubeChannelTitle" TEXT;
