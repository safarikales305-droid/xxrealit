-- CreateTable
CREATE TYPE "AiVisualizationStatus" AS ENUM ('DRAFT', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "AiVisualizationRenovationLevel" AS ENUM ('LIGHT', 'RENOVATION', 'MAJOR');
CREATE TYPE "AiVisualizationEventName" AS ENUM ('ai_visualization_open', 'ai_visualization_upload', 'ai_visualization_generate', 'ai_visualization_complete', 'ai_visualization_failed', 'ai_visualization_variant', 'ai_visualization_share', 'ai_visualization_download_click', 'ai_visualization_login_required', 'ai_visualization_download');
CREATE TYPE "AiVisualizationWatermarkPosition" AS ENUM ('BOTTOM_LEFT', 'BOTTOM_RIGHT');

CREATE TABLE "AiVisualizationSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "anonymousEnabled" BOOLEAN NOT NULL DEFAULT true,
    "anonymousFreeGenerations" INTEGER NOT NULL DEFAULT 2,
    "loggedInFreeGenerations" INTEGER NOT NULL DEFAULT 10,
    "maxUploadBytes" INTEGER NOT NULL DEFAULT 12582912,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "model" TEXT NOT NULL DEFAULT 'gpt-image-1',
    "outputQuality" TEXT NOT NULL DEFAULT 'high',
    "originalRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "resultRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "watermarkEnabled" BOOLEAN NOT NULL DEFAULT true,
    "watermarkPosition" "AiVisualizationWatermarkPosition" NOT NULL DEFAULT 'BOTTOM_RIGHT',
    "watermarkOnDownload" BOOLEAN NOT NULL DEFAULT false,
    "estimatedCostCzkPerGeneration" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiVisualizationSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiVisualization" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousSessionId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "parentId" TEXT,
    "status" "AiVisualizationStatus" NOT NULL DEFAULT 'DRAFT',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "propertyType" TEXT,
    "style" TEXT,
    "renovationLevel" "AiVisualizationRenovationLevel",
    "userPrompt" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "originalCloudinaryId" TEXT,
    "originalPreviewUrl" TEXT,
    "resultCloudinaryId" TEXT,
    "resultPreviewUrl" TEXT,
    "publicShareId" TEXT,
    "sharedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "ipHash" TEXT,
    "estimatedCostCzk" DOUBLE PRECISION,
    "usageMeta" JSONB,
    "generationStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiVisualization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiVisualizationEvent" (
    "id" TEXT NOT NULL,
    "eventName" "AiVisualizationEventName" NOT NULL,
    "visualizationId" TEXT,
    "userId" TEXT,
    "anonymousSessionId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiVisualizationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiVisualization_idempotencyKey_key" ON "AiVisualization"("idempotencyKey");
CREATE UNIQUE INDEX "AiVisualization_publicShareId_key" ON "AiVisualization"("publicShareId");
CREATE INDEX "AiVisualization_userId_createdAt_idx" ON "AiVisualization"("userId", "createdAt");
CREATE INDEX "AiVisualization_anonymousSessionId_createdAt_idx" ON "AiVisualization"("anonymousSessionId", "createdAt");
CREATE INDEX "AiVisualization_status_createdAt_idx" ON "AiVisualization"("status", "createdAt");
CREATE INDEX "AiVisualization_publicShareId_idx" ON "AiVisualization"("publicShareId");
CREATE INDEX "AiVisualization_ipHash_createdAt_idx" ON "AiVisualization"("ipHash", "createdAt");
CREATE INDEX "AiVisualizationEvent_eventName_createdAt_idx" ON "AiVisualizationEvent"("eventName", "createdAt");
CREATE INDEX "AiVisualizationEvent_visualizationId_idx" ON "AiVisualizationEvent"("visualizationId");

ALTER TABLE "AiVisualization" ADD CONSTRAINT "AiVisualization_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AiVisualization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
