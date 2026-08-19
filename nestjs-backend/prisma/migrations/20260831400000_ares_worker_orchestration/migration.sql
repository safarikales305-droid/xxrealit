-- ARES worker orchestration: QUEUED status, partition locks, heartbeat

ALTER TYPE "CompanyImportJobStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "CompanyImportJobStatus" ADD VALUE IF NOT EXISTS 'COMPLETED_WITH_WARNINGS';
ALTER TYPE "CompanyImportPartitionStatus" ADD VALUE IF NOT EXISTS 'RETRY_WAIT';

ALTER TABLE "CompanyImportJob"
  ADD COLUMN IF NOT EXISTS "lastWorkerActivityAt" TIMESTAMP(3);

ALTER TABLE "CompanyImportPartition"
  ADD COLUMN IF NOT EXISTS "lockedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "AresWorkerHeartbeat" (
  "id" TEXT NOT NULL DEFAULT 'ares-import-primary',
  "workerId" TEXT NOT NULL,
  "service" TEXT NOT NULL DEFAULT 'nestjs-backend',
  "status" TEXT NOT NULL DEFAULT 'ONLINE',
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastPollAt" TIMESTAMP(3),
  "currentJobId" TEXT,
  "currentPartitionId" TEXT,
  "currentPartitionLabel" TEXT,
  "lastError" TEXT,
  "pendingJobs" INTEGER NOT NULL DEFAULT 0,
  "pendingPartitions" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AresWorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- Treat legacy PENDING jobs as queued for worker pickup
UPDATE "CompanyImportJob"
SET "status" = 'QUEUED'
WHERE "status" = 'PENDING'
  AND "finishedAt" IS NULL
  AND "syncType" IN ('ARES_CZ_MASTER_SYNC', 'ALL_CZECH_COMPANIES');
