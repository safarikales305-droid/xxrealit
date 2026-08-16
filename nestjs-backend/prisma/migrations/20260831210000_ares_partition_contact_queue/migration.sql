-- ARES import + contact discovery workflow extensions

ALTER TYPE "CompanyContactDiscoveryEntryState" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "CompanyContactDiscoveryEntryState" ADD VALUE IF NOT EXISTS 'FAILED';

ALTER TABLE "CompanyContactDiscoveryBatch"
  ADD COLUMN IF NOT EXISTS "label" TEXT,
  ADD COLUMN IF NOT EXISTS "queued" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "currentCompanyName" TEXT,
  ADD COLUMN IF NOT EXISTS "filterJson" JSONB,
  ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

ALTER TABLE "CompanyContactDiscoveryJob"
  ADD COLUMN IF NOT EXISTS "error" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finishedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CompanyContactDiscoveryJob_batchId_status_idx"
  ON "CompanyContactDiscoveryJob"("batchId", "status");
