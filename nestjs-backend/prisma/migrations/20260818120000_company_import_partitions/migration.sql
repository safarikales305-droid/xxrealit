-- AlterEnum
ALTER TYPE "CompanyImportJobStatus" ADD VALUE IF NOT EXISTS 'PAUSE_REQUESTED';
ALTER TYPE "CompanyImportJobStatus" ADD VALUE IF NOT EXISTS 'CANCEL_REQUESTED';
ALTER TYPE "CompanyImportJobStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- CreateEnum
CREATE TYPE "CompanyImportPartitionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'SPLIT', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "CompanyImportJob" ADD COLUMN IF NOT EXISTS "pauseRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyImportJob" ADD COLUMN IF NOT EXISTS "cancelRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyImportJob" ADD COLUMN IF NOT EXISTS "auditLog" JSONB;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CompanyImportPartition" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT,
    "filtersJson" JSONB NOT NULL,
    "status" "CompanyImportPartitionStatus" NOT NULL DEFAULT 'PENDING',
    "estimatedCount" INTEGER,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyImportPartition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompanyImportPartition_jobId_status_sortOrder_idx" ON "CompanyImportPartition"("jobId", "status", "sortOrder");
CREATE INDEX IF NOT EXISTS "CompanyImportPartition_parentId_idx" ON "CompanyImportPartition"("parentId");

ALTER TABLE "CompanyImportPartition" DROP CONSTRAINT IF EXISTS "CompanyImportPartition_jobId_fkey";
ALTER TABLE "CompanyImportPartition" ADD CONSTRAINT "CompanyImportPartition_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CompanyImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyImportPartition" DROP CONSTRAINT IF EXISTS "CompanyImportPartition_parentId_fkey";
ALTER TABLE "CompanyImportPartition" ADD CONSTRAINT "CompanyImportPartition_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CompanyImportPartition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
