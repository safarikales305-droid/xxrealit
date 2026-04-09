ALTER TABLE "Post"
ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "Post_latitude_longitude_idx" ON "Post"("latitude", "longitude");
