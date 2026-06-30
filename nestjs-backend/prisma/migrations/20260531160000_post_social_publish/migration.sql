-- CreateEnum
CREATE TYPE "PostSocialPublishType" AS ENUM ('POST', 'REEL', 'SHORT');
CREATE TYPE "PostSocialPublishStatus" AS ENUM ('PENDING', 'UPLOADING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE IF NOT EXISTS "PostSocialPublish" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "publishType" "PostSocialPublishType" NOT NULL DEFAULT 'POST',
    "status" "PostSocialPublishStatus" NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT,
    "externalUrl" TEXT,
    "errorMessage" TEXT,
    "videoPreviewSeconds" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostSocialPublish_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PostSocialPublish_postId_platform_key" ON "PostSocialPublish"("postId", "platform");
CREATE INDEX IF NOT EXISTS "PostSocialPublish_postId_idx" ON "PostSocialPublish"("postId");
CREATE INDEX IF NOT EXISTS "PostSocialPublish_status_idx" ON "PostSocialPublish"("status");

ALTER TABLE "PostSocialPublish" DROP CONSTRAINT IF EXISTS "PostSocialPublish_postId_fkey";
ALTER TABLE "PostSocialPublish" ADD CONSTRAINT "PostSocialPublish_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill videoUrl from media for posts that have video in gallery but no videoUrl
UPDATE "Post" p
SET "videoUrl" = sub.url
FROM (
  SELECT m."postId", m.url
  FROM "Media" m
  WHERE LOWER(m.type) = 'video'
) sub
WHERE p.id = sub."postId"
  AND (p."videoUrl" IS NULL OR TRIM(p."videoUrl") = '');
