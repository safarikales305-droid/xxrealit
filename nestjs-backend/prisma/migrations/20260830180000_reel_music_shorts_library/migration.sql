-- Reuse ShortsMusicTrack for Facebook Reel templates (drop duplicate EditorialReelMusicTrack)

ALTER TABLE "EditorialReelTemplate" DROP CONSTRAINT IF EXISTS "EditorialReelTemplate_musicTrackId_fkey";

UPDATE "EditorialReelTemplate" SET "musicTrackId" = NULL WHERE "musicTrackId" IS NOT NULL;

DROP TABLE IF EXISTS "EditorialReelMusicTrack";

ALTER TABLE "EditorialReelTemplate"
  ADD CONSTRAINT "EditorialReelTemplate_musicTrackId_fkey"
  FOREIGN KEY ("musicTrackId") REFERENCES "ShortsMusicTrack"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
