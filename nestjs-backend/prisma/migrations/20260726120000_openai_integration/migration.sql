-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('OPENAI');

-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('PENDING', 'COMPLETED', 'APPROVED', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "provider" "AiProvider" NOT NULL DEFAULT 'OPENAI',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultModel" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
    "dailyRequestLimit" INTEGER NOT NULL DEFAULT 100,
    "monthlyBudgetCzk" INTEGER NOT NULL DEFAULT 1000,
    "maxOutputTokens" INTEGER NOT NULL DEFAULT 2000,
    "timeoutMs" INTEGER NOT NULL DEFAULT 60000,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "seoEnabled" BOOLEAN NOT NULL DEFAULT true,
    "listingDescriptionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "socialPostEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "supportEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastConnectionTestAt" TIMESTAMP(3),
    "lastConnectionSuccess" BOOLEAN,
    "lastConnectionError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL DEFAULT 'OPENAI',
    "feature" TEXT NOT NULL,
    "model" TEXT,
    "userId" TEXT,
    "requestId" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostCzk" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "safeErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiGeneration" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL DEFAULT 'v1',
    "model" TEXT,
    "status" "AiGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "generatedContent" JSONB,
    "approvedContent" JSONB,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsageLog_feature_idx" ON "AiUsageLog"("feature");

-- CreateIndex
CREATE INDEX "AiUsageLog_userId_idx" ON "AiUsageLog"("userId");

-- CreateIndex
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AiUsageLog_success_idx" ON "AiUsageLog"("success");

-- CreateIndex
CREATE INDEX "AiGeneration_feature_entityType_entityId_idx" ON "AiGeneration"("feature", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AiGeneration_status_idx" ON "AiGeneration"("status");

-- CreateIndex
CREATE INDEX "AiGeneration_createdAt_idx" ON "AiGeneration"("createdAt" DESC);

-- Seed default settings row
INSERT INTO "AiSettings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
