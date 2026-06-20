-- Post video sounds use shared Shorts music library
ALTER TABLE "Post" DROP CONSTRAINT IF EXISTS "Post_soundTrackId_fkey";

UPDATE "Post"
SET "soundTrackId" = NULL
WHERE "soundTrackId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ShortsMusicTrack" WHERE "id" = "Post"."soundTrackId"
  );

ALTER TABLE "Post" ADD CONSTRAINT "Post_soundTrackId_fkey"
  FOREIGN KEY ("soundTrackId") REFERENCES "ShortsMusicTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
