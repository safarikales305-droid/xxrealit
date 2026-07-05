-- Meta katalog PRO — exportní pole, synchronizace, historie

ALTER TABLE "MetaCatalogSetting" ADD COLUMN IF NOT EXISTS "allowContactExport" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MetaCatalogSetting" ADD COLUMN IF NOT EXISTS "exportFieldFlags" JSONB;
ALTER TABLE "MetaCatalogSetting" ADD COLUMN IF NOT EXISTS "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "MetaCatalogSetting" ADD COLUMN IF NOT EXISTS "lastSyncAt" TIMESTAMP(3);
ALTER TABLE "MetaCatalogSetting" ADD COLUMN IF NOT EXISTS "nextSyncAt" TIMESTAMP(3);
ALTER TABLE "MetaCatalogSetting" ADD COLUMN IF NOT EXISTS "syncRunning" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MetaCatalogSetting" ADD COLUMN IF NOT EXISTS "feedCacheClearedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "MetaCatalogSyncRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "exportedCount" INTEGER NOT NULL DEFAULT 0,
    "changedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "result" TEXT NOT NULL DEFAULT 'running',
    "mode" TEXT NOT NULL DEFAULT 'full',
    "errorMessage" TEXT,
    "details" JSONB,
    CONSTRAINT "MetaCatalogSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MetaCatalogSyncRun_startedAt_idx" ON "MetaCatalogSyncRun"("startedAt" DESC);

CREATE TABLE IF NOT EXISTS "MetaCatalogExportItem" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "metaProductId" TEXT,
    "exportStatus" TEXT NOT NULL DEFAULT 'pending',
    "lastExportedAt" TIMESTAMP(3),
    "lastChangedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "pixelStatus" TEXT,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "payloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetaCatalogExportItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MetaCatalogExportItem_propertyId_key" ON "MetaCatalogExportItem"("propertyId");
CREATE INDEX IF NOT EXISTS "MetaCatalogExportItem_exportStatus_idx" ON "MetaCatalogExportItem"("exportStatus");

CREATE TABLE IF NOT EXISTS "MetaCatalogLog" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "message" TEXT,
    "propertyId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetaCatalogLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MetaCatalogLog_createdAt_idx" ON "MetaCatalogLog"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MetaCatalogLog_eventType_idx" ON "MetaCatalogLog"("eventType");
