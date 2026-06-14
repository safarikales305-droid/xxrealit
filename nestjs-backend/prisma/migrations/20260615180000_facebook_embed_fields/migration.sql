-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FacebookPostType" AS ENUM ('FACEBOOK_POST', 'FACEBOOK_VIDEO', 'FACEBOOK_REEL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "facebookPostType" "FacebookPostType";
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "facebookEmbedUrl" TEXT;
