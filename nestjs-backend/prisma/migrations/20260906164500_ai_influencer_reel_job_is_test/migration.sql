-- AlterTable
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "AiInfluencerReelJob_isTest_createdAt_idx" ON "AiInfluencerReelJob"("isTest", "createdAt");
