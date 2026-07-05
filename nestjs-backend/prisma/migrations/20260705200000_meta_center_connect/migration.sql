-- Meta Centrum — automatické OAuth připojení

ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "metaUserAccessTokenEncrypted" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "metaUserTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "metaConnectedUserId" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "metaConnectedUserName" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "metaConnectedAt" TIMESTAMP(3);
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "adAccountId" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "adAccountName" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "pageId" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "pageName" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "pageAccessTokenEncrypted" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "instagramBusinessId" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "instagramUsername" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "catalogName" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "commerceAccountId" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "testEventCode" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "whatsappBusinessAccountId" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "whatsappPhoneNumberId" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "connectionSnapshot" JSONB;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "diagnosticsSnapshot" JSONB;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "lastAutoSyncAt" TIMESTAMP(3);
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "syncEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "MetaCenterApiLog" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "request" JSONB,
    "response" JSONB,
    "httpStatus" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaCenterApiLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MetaCenterApiLog_createdAt_idx" ON "MetaCenterApiLog"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MetaCenterApiLog_endpoint_idx" ON "MetaCenterApiLog"("endpoint");
