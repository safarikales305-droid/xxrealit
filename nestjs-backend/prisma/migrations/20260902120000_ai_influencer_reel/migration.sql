-- CreateEnum
CREATE TYPE "AiInfluencerReelJobStatus" AS ENUM ('ARTICLE_PUBLISHED', 'EVALUATING', 'CANDIDATE', 'SCRIPT_GENERATING', 'SCRIPT_READY', 'VOICE_GENERATING', 'VOICE_READY', 'AVATAR_GENERATING', 'AVATAR_READY', 'RENDERING', 'READY', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiInfluencerApprovalMode" AS ENUM ('MANUAL', 'SEMI_AUTO', 'FULL_AUTO');

-- CreateEnum
CREATE TYPE "AiInfluencerQualityMode" AS ENUM ('ECONOMY', 'STANDARD', 'PREMIUM');

-- CreateEnum
CREATE TYPE "AiAvatarProviderType" AS ENUM ('HEYGEN', 'DID');

-- CreateEnum
CREATE TYPE "AiVoiceProviderType" AS ENUM ('ELEVENLABS');

-- CreateEnum
CREATE TYPE "AiInfluencerContentFormat" AS ENUM ('REALITNI_MINUTA', 'CENY_NEMOVITOSTI', 'HYPOTEKY', 'TIP_PRO_MAJITELE', 'TIP_PRO_KUPUJICI', 'REKONSTRUKCE', 'VEDELI_JSTE', 'BREAKING_NEWS');

-- CreateEnum
CREATE TYPE "ProviderGenerationType" AS ENUM ('VOICE', 'AVATAR');

-- CreateEnum
CREATE TYPE "ProviderGenerationStatus" AS ENUM ('QUEUED', 'GENERATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "AiInfluencerProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "avatarProvider" "AiAvatarProviderType" NOT NULL DEFAULT 'HEYGEN',
    "avatarId" TEXT,
    "voiceProvider" "AiVoiceProviderType" NOT NULL DEFAULT 'ELEVENLABS',
    "voiceId" TEXT,
    "language" TEXT NOT NULL DEFAULT 'cs-CZ',
    "personalityPrompt" TEXT,
    "defaultStyle" TEXT,
    "defaultDuration" INTEGER NOT NULL DEFAULT 35,
    "virtualPresenter" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "voiceSpeed" DOUBLE PRECISION,
    "voiceStability" DOUBLE PRECISION,
    "voiceStyle" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiInfluencerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleReelCandidate" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "reelPotentialScore" INTEGER NOT NULL,
    "topicInterest" INTEGER,
    "freshness" INTEGER,
    "hookPotential" INTEGER,
    "practicalValue" INTEGER,
    "emotionalInterest" INTEGER,
    "visualPotential" INTEGER,
    "localInterest" INTEGER,
    "sourceTrust" INTEGER,
    "duplicationPenalty" INTEGER,
    "reasoningSummary" JSONB,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "topicClusterId" TEXT,

    CONSTRAINT "ArticleReelCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInfluencerReelJob" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "candidateId" TEXT,
    "profileId" TEXT NOT NULL,
    "status" "AiInfluencerReelJobStatus" NOT NULL DEFAULT 'EVALUATING',
    "contentFormat" "AiInfluencerContentFormat",
    "failedStage" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "hookCandidates" JSONB,
    "selectedHook" TEXT,
    "scriptJson" JSONB,
    "spokenText" TEXT,
    "captionTitle" TEXT,
    "captionDescription" TEXT,
    "hashtags" TEXT,
    "estimatedDurationSec" INTEGER,
    "scriptHash" TEXT,
    "voiceStoragePath" TEXT,
    "voiceStorageUrl" TEXT,
    "voiceHash" TEXT,
    "avatarStoragePath" TEXT,
    "avatarStorageUrl" TEXT,
    "avatarHash" TEXT,
    "avatarExternalJobId" TEXT,
    "scenesJson" JSONB,
    "musicTrackId" TEXT,
    "videoPath" TEXT,
    "videoUrl" TEXT,
    "thumbnailUrl" TEXT,
    "renderedAt" TIMESTAMP(3),
    "aiCostEstimated" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "voiceCostEstimated" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avatarCostEstimated" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "renderCostEstimated" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalExternalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "postId" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'AI_INFLUENCER',
    "ownershipType" "EditorialReelOwnershipType" NOT NULL DEFAULT 'OWNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiInfluencerReelJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderGeneration" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "type" "ProviderGenerationType" NOT NULL,
    "contentHash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "ProviderGenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "externalJobId" TEXT,
    "storagePath" TEXT,
    "storageUrl" TEXT,
    "costEstimated" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiInfluencerProfile_slug_key" ON "AiInfluencerProfile"("slug");

-- CreateIndex
CREATE INDEX "ArticleReelCandidate_articleId_evaluatedAt_idx" ON "ArticleReelCandidate"("articleId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "ArticleReelCandidate_reelPotentialScore_idx" ON "ArticleReelCandidate"("reelPotentialScore");

-- CreateIndex
CREATE INDEX "AiInfluencerReelJob_status_createdAt_idx" ON "AiInfluencerReelJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AiInfluencerReelJob_articleId_idx" ON "AiInfluencerReelJob"("articleId");

-- CreateIndex
CREATE INDEX "ProviderGeneration_status_createdAt_idx" ON "ProviderGeneration"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderGeneration_type_contentHash_provider_key" ON "ProviderGeneration"("type", "contentHash", "provider");

-- AddForeignKey
ALTER TABLE "ArticleReelCandidate" ADD CONSTRAINT "ArticleReelCandidate_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInfluencerReelJob" ADD CONSTRAINT "AiInfluencerReelJob_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInfluencerReelJob" ADD CONSTRAINT "AiInfluencerReelJob_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ArticleReelCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInfluencerReelJob" ADD CONSTRAINT "AiInfluencerReelJob_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AiInfluencerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInfluencerReelJob" ADD CONSTRAINT "AiInfluencerReelJob_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderGeneration" ADD CONSTRAINT "ProviderGeneration_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AiInfluencerReelJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
