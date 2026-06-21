-- Post video sounds use shared Shorts music library (idempotent)
ALTER TABLE "Post" DROP CONSTRAINT IF EXISTS "Post_soundTrackId_fkey";

UPDATE "Post"
SET "soundTrackId" = NULL
WHERE "soundTrackId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ShortsMusicTrack" WHERE "id" = "Post"."soundTrackId"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Post_soundTrackId_fkey'
  ) THEN
    ALTER TABLE "Post" ADD CONSTRAINT "Post_soundTrackId_fkey"
      FOREIGN KEY ("soundTrackId") REFERENCES "ShortsMusicTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
