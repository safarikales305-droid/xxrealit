-- Rozšířený log Facebook publikování
CREATE TYPE "SocialPublishKind" AS ENUM ('PHOTO_POST', 'VIDEO_REEL', 'USER_POST', 'LISTING');

ALTER TABLE "SocialPublishLog" ADD COLUMN "publishKind" "SocialPublishKind";
ALTER TABLE "SocialPublishLog" ADD COLUMN "contentTitle" TEXT;
ALTER TABLE "SocialPublishLog" ADD COLUMN "externalReelId" TEXT;
ALTER TABLE "SocialPublishLog" ADD COLUMN "reelPublishedUrl" TEXT;
ALTER TABLE "SocialPublishLog" ADD COLUMN "teaserDurationSec" DOUBLE PRECISION;
ALTER TABLE "SocialPublishLog" ADD COLUMN "originalVideoDurationSec" DOUBLE PRECISION;
ALTER TABLE "SocialPublishLog" ADD COLUMN "graphApiResponse" JSONB;
