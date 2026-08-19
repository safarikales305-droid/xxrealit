-- ARES master sync: persistent seen ICO, request log, sync type
CREATE TYPE "CompanyImportSyncType" AS ENUM ('TARGETED', 'ARES_CZ_MASTER_SYNC', 'ALL_CZECH_COMPANIES');

ALTER TABLE "CompanyImportJob"
  ADD COLUMN IF NOT EXISTS "syncType" "CompanyImportSyncType" NOT NULL DEFAULT 'TARGETED',
  ADD COLUMN IF NOT EXISTS "jobUniqueIcoCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "inactiveSkipped" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "alreadySeenSkipped" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "duplicateQueryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "warningCode" TEXT,
  ADD COLUMN IF NOT EXISTS "importSubjectTypes" JSONB;

CREATE TABLE IF NOT EXISTS "AresSyncSeenCompany" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "ico" TEXT NOT NULL,
  "partitionKey" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AresSyncSeenCompany_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AresSyncSeenCompany_jobId_ico_key" ON "AresSyncSeenCompany"("jobId", "ico");
CREATE INDEX IF NOT EXISTS "AresSyncSeenCompany_jobId_idx" ON "AresSyncSeenCompany"("jobId");

ALTER TABLE "AresSyncSeenCompany"
  ADD CONSTRAINT "AresSyncSeenCompany_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "CompanyImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "AresImportRequestLog" (
  "id" TEXT NOT NULL,
  "jobId" TEXT,
  "endpoint" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "requestBody" JSONB NOT NULL,
  "httpStatus" INTEGER NOT NULL,
  "pocetCelkem" INTEGER,
  "returnedCount" INTEGER NOT NULL DEFAULT 0,
  "uniqueIcoCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "seenInJobCount" INTEGER NOT NULL DEFAULT 0,
  "offset" INTEGER NOT NULL DEFAULT 0,
  "durationMs" INTEGER NOT NULL DEFAULT 0,
  "responseFingerprint" TEXT,
  "duplicateQuery" BOOLEAN NOT NULL DEFAULT false,
  "suspiciousDuplicate" BOOLEAN NOT NULL DEFAULT false,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AresImportRequestLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AresImportRequestLog_jobId_createdAt_idx" ON "AresImportRequestLog"("jobId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AresImportRequestLog_requestHash_idx" ON "AresImportRequestLog"("requestHash");

ALTER TABLE "AresImportRequestLog"
  ADD CONSTRAINT "AresImportRequestLog_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "CompanyImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
