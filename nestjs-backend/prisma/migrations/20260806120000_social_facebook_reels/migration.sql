-- Facebook Reels autopost: typ publikace + volba formátu u plánu

ALTER TABLE "SocialPublishQueue" ADD COLUMN IF NOT EXISTS "facebookPostType" "FacebookPostType";

ALTER TABLE "SocialPublishLog" ADD COLUMN IF NOT EXISTS "facebookPostType" "FacebookPostType";

ALTER TABLE "SocialPublishSchedule" ADD COLUMN IF NOT EXISTS "shortsPublishAsReel" BOOLEAN;
