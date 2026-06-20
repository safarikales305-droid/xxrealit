-- Post sound tracks (Facebook-style music on video posts)
CREATE TABLE "PostSoundTrack" (
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

ALTER TABLE "Post" ADD COLUMN "soundTrackId" TEXT;

CREATE INDEX "PostSoundTrack_isActive_idx" ON "PostSoundTrack"("isActive");
CREATE INDEX "PostSoundTrack_createdAt_idx" ON "PostSoundTrack"("createdAt");
CREATE INDEX "Post_soundTrackId_idx" ON "Post"("soundTrackId");

ALTER TABLE "PostSoundTrack" ADD CONSTRAINT "PostSoundTrack_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_soundTrackId_fkey" FOREIGN KEY ("soundTrackId") REFERENCES "PostSoundTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
