-- CreateEnum
CREATE TYPE "CompanySeoPageStatus" AS ENUM ('PENDING', 'WAITING_FOR_ENRICHMENT', 'GENERATING', 'DRAFT', 'READY', 'DUPLICATE_CONTENT_REVIEW', 'SEO_OUTDATED', 'ERROR');

-- CreateEnum
CREATE TYPE "CompanySeoGenerationJobStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "CompanySeoGenerationItemStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'SKIPPED', 'FAILED', 'WAITING_FOR_ENRICHMENT');

-- CreateEnum
CREATE TYPE "CompanySeoGenerationJobType" AS ENUM ('TEST', 'BATCH_10', 'BATCH_100', 'FILTER');

-- AlterEnum
ALTER TYPE "CompanyAuditAction" ADD VALUE 'COMPANY_SEO_PAGE_GENERATED';
ALTER TYPE "CompanyAuditAction" ADD VALUE 'COMPANY_SEO_PAGE_UPDATED';

-- CreateTable
CREATE TABLE "CompanySeoPage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metaDescription" TEXT NOT NULL,
    "shortDescription" TEXT,
    "longDescription" TEXT,
    "content" JSONB,
    "seoScore" INTEGER NOT NULL DEFAULT 0,
    "status" "CompanySeoPageStatus" NOT NULL DEFAULT 'PENDING',
    "indexable" BOOLEAN NOT NULL DEFAULT false,
    "contentHash" TEXT,
    "similarityScore" FLOAT,
    "qualityNotes" TEXT,
    "errorMessage" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySeoPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySeoGenerationJob" (
    "id" TEXT NOT NULL,
    "type" "CompanySeoGenerationJobType" NOT NULL,
    "status" "CompanySeoGenerationJobStatus" NOT NULL DEFAULT 'PENDING',
    "requestedCount" INTEGER NOT NULL DEFAULT 1,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "filtersJson" JSONB,
    "currentItem" TEXT,
    "lastError" TEXT,
    "pauseReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySeoGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySeoGenerationItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "seoPageId" TEXT,
    "status" "CompanySeoGenerationItemStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "phase" TEXT,
    "qualityScore" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySeoGenerationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanySeoPage_companyId_key" ON "CompanySeoPage"("companyId");

-- CreateIndex
CREATE INDEX "CompanySeoPage_slug_idx" ON "CompanySeoPage"("slug");

-- CreateIndex
CREATE INDEX "CompanySeoPage_status_indexable_idx" ON "CompanySeoPage"("status", "indexable");

-- CreateIndex
CREATE INDEX "CompanySeoPage_seoScore_idx" ON "CompanySeoPage"("seoScore");

-- CreateIndex
CREATE INDEX "CompanySeoPage_updatedAt_idx" ON "CompanySeoPage"("updatedAt" DESC);

-- CreateIndex
CREATE INDEX "CompanySeoGenerationJob_status_idx" ON "CompanySeoGenerationJob"("status");

-- CreateIndex
CREATE INDEX "CompanySeoGenerationJob_createdAt_idx" ON "CompanySeoGenerationJob"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "CompanySeoGenerationItem_jobId_status_idx" ON "CompanySeoGenerationItem"("jobId", "status");

-- CreateIndex
CREATE INDEX "CompanySeoGenerationItem_companyId_idx" ON "CompanySeoGenerationItem"("companyId");

-- AddForeignKey
ALTER TABLE "CompanySeoPage" ADD CONSTRAINT "CompanySeoPage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySeoGenerationItem" ADD CONSTRAINT "CompanySeoGenerationItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CompanySeoGenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySeoGenerationItem" ADD CONSTRAINT "CompanySeoGenerationItem_seoPageId_fkey" FOREIGN KEY ("seoPageId") REFERENCES "CompanySeoPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
