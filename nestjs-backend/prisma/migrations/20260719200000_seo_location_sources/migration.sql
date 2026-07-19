-- CreateEnum
CREATE TYPE "SeoLocationSourceType" AS ENUM ('RUIAN', 'CSU', 'CUSTOM');
CREATE TYPE "SeoLocationSourceMode" AS ENUM ('OFFICIAL_URL', 'REMOTE_URL', 'UPLOAD');

-- AlterTable SeoLocation
ALTER TABLE "SeoLocation" ADD COLUMN IF NOT EXISTS "slugLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SeoLocation" ADD COLUMN IF NOT EXISTS "dataSource" "SeoLocationSourceType";
ALTER TABLE "SeoLocation" ADD COLUMN IF NOT EXISTS "seoEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "SeoLocation_dataSource_idx" ON "SeoLocation"("dataSource");
CREATE INDEX IF NOT EXISTS "SeoLocation_seoEnabled_idx" ON "SeoLocation"("seoEnabled");

-- CreateTable SeoLocationSource
CREATE TABLE IF NOT EXISTS "SeoLocationSource" (
    "id" TEXT NOT NULL,
    "type" "SeoLocationSourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "sourceMode" "SeoLocationSourceMode" NOT NULL DEFAULT 'OFFICIAL_URL',
    "sourceUrl" TEXT,
    "fileType" TEXT,
    "configJson" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoSync" BOOLEAN NOT NULL DEFAULT false,
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 1440,
    "lastSyncAt" TIMESTAMP(3),
    "lastStatus" TEXT NOT NULL DEFAULT 'idle',
    "lastError" TEXT,
    "lastEtag" TEXT,
    "lastModified" TEXT,
    "lastDataVersion" TEXT,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SeoLocationSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SeoLocationSource_type_idx" ON "SeoLocationSource"("type");
CREATE INDEX IF NOT EXISTS "SeoLocationSource_lastStatus_idx" ON "SeoLocationSource"("lastStatus");

-- CreateTable SeoLocationFieldMapping
CREATE TABLE IF NOT EXISTS "SeoLocationFieldMapping" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceField" TEXT NOT NULL,
    "targetField" TEXT NOT NULL,
    "transform" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeoLocationFieldMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SeoLocationFieldMapping_sourceId_sourceField_key" ON "SeoLocationFieldMapping"("sourceId", "sourceField");
CREATE INDEX IF NOT EXISTS "SeoLocationFieldMapping_sourceId_idx" ON "SeoLocationFieldMapping"("sourceId");

ALTER TABLE "SeoLocationFieldMapping" DROP CONSTRAINT IF EXISTS "SeoLocationFieldMapping_sourceId_fkey";
ALTER TABLE "SeoLocationFieldMapping" ADD CONSTRAINT "SeoLocationFieldMapping_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SeoLocationSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable SeoLocationUpload
CREATE TABLE IF NOT EXISTS "SeoLocationUpload" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "detectedFormat" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "previewJson" JSONB,
    "validationErrors" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeoLocationUpload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SeoLocationUpload_sourceId_idx" ON "SeoLocationUpload"("sourceId");
CREATE INDEX IF NOT EXISTS "SeoLocationUpload_expiresAt_idx" ON "SeoLocationUpload"("expiresAt");

ALTER TABLE "SeoLocationUpload" DROP CONSTRAINT IF EXISTS "SeoLocationUpload_sourceId_fkey";
ALTER TABLE "SeoLocationUpload" ADD CONSTRAINT "SeoLocationUpload_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SeoLocationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable SeoLocationImportRun
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "uploadId" TEXT;
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'live';
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "filename" TEXT;
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "skipped" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SeoLocationImportRun" ADD COLUMN IF NOT EXISTS "logJson" JSONB;

-- Rename source column if exists (old string label)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='SeoLocationImportRun' AND column_name='source') THEN
    ALTER TABLE "SeoLocationImportRun" RENAME COLUMN "source" TO "sourceLabel";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SeoLocationImportRun_sourceId_idx" ON "SeoLocationImportRun"("sourceId");

ALTER TABLE "SeoLocationImportRun" DROP CONSTRAINT IF EXISTS "SeoLocationImportRun_sourceId_fkey";
ALTER TABLE "SeoLocationImportRun" ADD CONSTRAINT "SeoLocationImportRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SeoLocationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
