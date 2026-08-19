-- Add stable partition keys for ARES import deduplication
ALTER TABLE "CompanyImportPartition" ADD COLUMN IF NOT EXISTS "partitionKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyImportPartition_jobId_partitionKey_key"
  ON "CompanyImportPartition" ("jobId", "partitionKey");
