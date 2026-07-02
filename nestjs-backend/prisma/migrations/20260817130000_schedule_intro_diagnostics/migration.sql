ALTER TABLE "SocialPublishSchedule" ADD COLUMN IF NOT EXISTS "lastIntroVideoAttemptId" TEXT;
ALTER TABLE "SocialPublishSchedule" ADD COLUMN IF NOT EXISTS "lastIntroVideoError" TEXT;
ALTER TABLE "SocialPublishSchedule" ADD COLUMN IF NOT EXISTS "lastRawPropertyType" TEXT;
ALTER TABLE "SocialPublishSchedule" ADD COLUMN IF NOT EXISTS "lastNormalizedPropertyType" TEXT;
ALTER TABLE "SocialPublishSchedule" ADD COLUMN IF NOT EXISTS "lastMatchedIntroPropertyType" "SocialIntroPropertyType";
