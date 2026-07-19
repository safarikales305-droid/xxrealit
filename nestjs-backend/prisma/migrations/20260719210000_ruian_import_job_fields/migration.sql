-- Rozšíření SeoLocationImportRun pro odolný RÚIAN background import
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "phase" TEXT;
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "message" TEXT;
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "sourceFileSize" BIGINT;
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "currentFile" TEXT;
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "bytesRead" BIGINT DEFAULT 0;
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "totalBytes" BIGINT;
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "importScope" TEXT;
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "heartbeatAt" TIMESTAMP(3);
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "lastCheckpointAt" TIMESTAMP(3);
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "errorCode" TEXT;
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "errorStackMasked" TEXT;
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "jobMeta" JSONB;

CREATE INDEX IF NOT EXISTS "SeoLocationImportRun_status_idx" ON "SeoLocationImportRun"("status");
