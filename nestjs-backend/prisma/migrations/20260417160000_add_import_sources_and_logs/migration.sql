-- CreateEnum
CREATE TYPE "ListingImportMethod" AS ENUM ('soap', 'scraper', 'xml', 'csv', 'other');

-- CreateEnum
CREATE TYPE "ListingImportPortal" AS ENUM ('reality_cz', 'xml_feed', 'csv_feed', 'other');

-- AlterTable
ALTER TABLE "Property"
ADD COLUMN "importDisabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "importExternalId" TEXT,
ADD COLUMN "importMethod" "ListingImportMethod",
ADD COLUMN "importSource" "ListingImportPortal",
ADD COLUMN "importSourceUrl" TEXT,
ADD COLUMN "importedAt" TIMESTAMP(3),
ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ImportSource" (
  "id" TEXT NOT NULL,
  "portal" "ListingImportPortal" NOT NULL,
  "method" "ListingImportMethod" NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "intervalMinutes" INTEGER NOT NULL DEFAULT 60,
  "limitPerRun" INTEGER NOT NULL DEFAULT 100,
  "endpointUrl" TEXT,
  "credentialsJson" JSONB,
  "settingsJson" JSONB,
  "lastRunAt" TIMESTAMP(3),
  "lastStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportLog" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "portal" "ListingImportPortal" NOT NULL,
  "method" "ListingImportMethod" NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "importedNew" INTEGER NOT NULL DEFAULT 0,
  "importedUpdated" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0,
  "disabled" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "payloadJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Property_importSource_importMethod_idx" ON "Property"("importSource", "importMethod");

-- CreateIndex
CREATE INDEX "Property_importExternalId_importSource_idx" ON "Property"("importExternalId", "importSource");

-- CreateIndex
CREATE UNIQUE INDEX "property_import_source_external_uq" ON "Property"("importSource", "importExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "import_source_portal_method_uq" ON "ImportSource"("portal", "method");

-- CreateIndex
CREATE INDEX "ImportSource_enabled_updatedAt_idx" ON "ImportSource"("enabled", "updatedAt");

-- CreateIndex
CREATE INDEX "ImportLog_sourceId_createdAt_idx" ON "ImportLog"("sourceId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportLog_portal_method_createdAt_idx" ON "ImportLog"("portal", "method", "createdAt");

-- AddForeignKey
ALTER TABLE "ImportLog"
ADD CONSTRAINT "ImportLog_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ImportSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
