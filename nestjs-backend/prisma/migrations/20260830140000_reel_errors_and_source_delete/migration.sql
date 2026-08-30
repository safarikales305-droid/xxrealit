-- Reel job error tracking + template snapshot
ALTER TABLE "EditorialReelJob" ADD COLUMN IF NOT EXISTS "failedStage" TEXT;
ALTER TABLE "EditorialReelJob" ADD COLUMN IF NOT EXISTS "errorCode" TEXT;
ALTER TABLE "EditorialReelJob" ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "EditorialReelJob" ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EditorialReelJob" ADD COLUMN IF NOT EXISTS "templateSnapshot" JSONB;
