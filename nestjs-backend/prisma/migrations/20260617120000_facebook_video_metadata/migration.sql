-- Facebook video metadata on Post
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "facebookVideoThumbnail" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "facebookVideoDurationSec" DOUBLE PRECISION;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "facebookVideoSourceUrl" TEXT;

-- Import diagnostics on FacebookSyncedPost
ALTER TABLE "FacebookSyncedPost" ADD COLUMN IF NOT EXISTS "videoSourceUrl" TEXT;
ALTER TABLE "FacebookSyncedPost" ADD COLUMN IF NOT EXISTS "videoUrlFailureReason" TEXT;

-- Existing FB video posts: drop standalone image media, keep thumbnail in previewImage
DELETE FROM "Media" m
USING "Post" p
WHERE m."postId" = p.id
  AND p."source" = 'FACEBOOK'
  AND m.type = 'image'
  AND (
    p."facebookPostType" IN ('FACEBOOK_VIDEO', 'FACEBOOK_REEL')
    OR p."videoUrl" IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM "Media" v
      WHERE v."postId" = p.id AND v.type = 'video'
    )
  );

UPDATE "Post"
SET
  "previewImage" = COALESCE("previewImage", "imageUrl", "facebookVideoThumbnail"),
  "facebookVideoThumbnail" = COALESCE("facebookVideoThumbnail", "previewImage", "imageUrl"),
  "imageUrl" = NULL
WHERE "source" = 'FACEBOOK'
  AND (
    "facebookPostType" IN ('FACEBOOK_VIDEO', 'FACEBOOK_REEL')
    OR "videoUrl" IS NOT NULL
  )
  AND "imageUrl" IS NOT NULL;
