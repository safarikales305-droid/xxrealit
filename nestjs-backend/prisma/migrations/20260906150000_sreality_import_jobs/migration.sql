-- CreateTable
CREATE TABLE "SrealityImportJob" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "stageUpdatedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "imagesFound" INTEGER NOT NULL DEFAULT 0,
    "imagesSelected" INTEGER NOT NULL DEFAULT 0,
    "imagesProcessed" INTEGER NOT NULL DEFAULT 0,
    "imagesImported" INTEGER NOT NULL DEFAULT 0,
    "imagesFailed" INTEGER NOT NULL DEFAULT 0,
    "agentStatus" TEXT,
    "phoneStatus" TEXT,
    "emailStatus" TEXT,
    "browserStatus" TEXT,
    "pageStatus" TEXT,
    "galleryStatus" TEXT,
    "draftId" TEXT,
    "retryFromStage" TEXT,
    "logsJson" JSONB NOT NULL DEFAULT '[]',
    "diagnosticsJson" JSONB,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SrealityImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SrealityImportJob_adminUserId_createdAt_idx" ON "SrealityImportJob"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "SrealityImportJob_status_idx" ON "SrealityImportJob"("status");

-- CreateIndex
CREATE INDEX "SrealityImportJob_createdAt_idx" ON "SrealityImportJob"("createdAt");
