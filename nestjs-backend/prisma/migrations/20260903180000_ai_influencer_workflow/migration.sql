-- AI Influencer workflow states + progress tracking
ALTER TYPE "AiInfluencerReelJobStatus" ADD VALUE IF NOT EXISTS 'SKIPPED_QUALITY';
ALTER TYPE "AiInfluencerReelJobStatus" ADD VALUE IF NOT EXISTS 'SKIPPED_DUPLICATE';
ALTER TYPE "AiInfluencerReelJobStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_PUBLISHED';

ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "progressPercent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "currentStep" TEXT;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "skipReason" TEXT;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "forceOverride" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "spokenTextTts" TEXT;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "automationPaused" BOOLEAN NOT NULL DEFAULT false;

-- Normalize historical quality rejections mislabeled as FAILED
UPDATE "AiInfluencerReelJob"
SET
  status = 'SKIPPED_QUALITY',
  "skipReason" = COALESCE("errorMessage", 'Nízký potenciál pro AI Reel'),
  "failedStage" = NULL,
  "errorCode" = NULL,
  "errorMessage" = NULL,
  "progressPercent" = 100,
  "currentStep" = 'Nízký potenciál pro AI Reel'
WHERE
  status = 'FAILED'
  AND "failedStage" = 'EVALUATION'
  AND (
    "errorMessage" ILIKE '%pod minimem%'
    OR "errorMessage" ILIKE '%score%'
  );
