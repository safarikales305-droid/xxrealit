-- CreateEnum
CREATE TYPE "SeoGenerationJobStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SeoGenerationJobType" AS ENUM ('TEST', 'BATCH', 'ALL', 'REGENERATE_DRAFTS', 'REGENERATE_ERRORS', 'REGENERATE_STALE');

-- AlterTable
ALTER TABLE "SeoPageContent" ADD COLUMN "lastGeneratedAt" TIMESTAMP(3),
ADD COLUMN "generationVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "checksum" TEXT,
ADD COLUMN "lastError" TEXT;

-- CreateIndex
CREATE INDEX "SeoPageContent_checksum_idx" ON "SeoPageContent"("checksum");

-- CreateTable
CREATE TABLE "SeoGenerationJob" (
    "id" TEXT NOT NULL,
    "type" "SeoGenerationJobType" NOT NULL,
    "status" "SeoGenerationJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "createdItems" INTEGER NOT NULL DEFAULT 0,
    "updatedItems" INTEGER NOT NULL DEFAULT 0,
    "skippedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "batchSize" INTEGER NOT NULL DEFAULT 100,
    "currentCursor" INTEGER NOT NULL DEFAULT 0,
    "currentItem" TEXT,
    "filtersJson" JSONB,
    "jobMeta" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeoGenerationJob_status_idx" ON "SeoGenerationJob"("status");

-- CreateIndex
CREATE INDEX "SeoGenerationJob_createdAt_idx" ON "SeoGenerationJob"("createdAt" DESC);
