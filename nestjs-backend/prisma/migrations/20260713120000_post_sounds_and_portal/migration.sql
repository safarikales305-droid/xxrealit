-- Post sound tracks (Facebook-style music on video posts) — idempotent after partial db push
CREATE TABLE IF NOT EXISTS "PostSoundTrack" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "fileUrl" TEXT NOT NULL,
    "previewUrl" TEXT,
    "cloudinaryPublicId" TEXT,
    "mimeType" TEXT NOT NULL,
    "durationSec" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "PostSoundTrack_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "soundTrackId" TEXT;

CREATE INDEX IF NOT EXISTS "PostSoundTrack_isActive_idx" ON "PostSoundTrack"("isActive");
CREATE INDEX IF NOT EXISTS "PostSoundTrack_createdAt_idx" ON "PostSoundTrack"("createdAt");
CREATE INDEX IF NOT EXISTS "Post_soundTrackId_idx" ON "Post"("soundTrackId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PostSoundTrack_uploadedById_fkey'
  ) THEN
    ALTER TABLE "PostSoundTrack" ADD CONSTRAINT "PostSoundTrack_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Post_soundTrackId_fkey'
  ) THEN
    ALTER TABLE "Post" ADD CONSTRAINT "Post_soundTrackId_fkey"
      FOREIGN KEY ("soundTrackId") REFERENCES "PostSoundTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
