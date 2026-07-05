-- Meta Centrum XXREALIT

CREATE TABLE IF NOT EXISTS "MetaCenterSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "facebookAppId" TEXT,
    "facebookAppSecret" TEXT,
    "facebookPagesAppId" TEXT,
    "facebookPagesSecret" TEXT,
    "businessManagerId" TEXT,
    "commerceManagerId" TEXT,
    "catalogId" TEXT,
    "datasetId" TEXT,
    "pixelId" TEXT,
    "pixelName" TEXT,
    "conversionsApiToken" TEXT,
    "webhookVerifyToken" TEXT,
    "webhookSecret" TEXT,
    "frontendUrl" TEXT,
    "backendUrl" TEXT,
    "redirectUri" TEXT,
    "callbackUrl" TEXT,
    "encryptionKey" TEXT,
    "graphApiVersion" TEXT NOT NULL DEFAULT 'v21.0',
    "domainVerification" TEXT,
    "capiEventToggles" JSONB,
    "pixelMapping" JSONB,
    "serviceStatus" JSONB,
    "remarketingAudiences" JSONB,
    "autoCampaignRules" JSONB,
    "adFormatFlags" JSONB,
    "catalogFeedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaCenterSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MetaCenterEventLog" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "listingId" TEXT,
    "userId" TEXT,
    "result" TEXT NOT NULL DEFAULT 'ok',
    "status" TEXT,
    "response" JSONB,
    "request" JSONB,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaCenterEventLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MetaCenterEventLog_eventType_idx" ON "MetaCenterEventLog"("eventType");
CREATE INDEX IF NOT EXISTS "MetaCenterEventLog_createdAt_idx" ON "MetaCenterEventLog"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MetaCenterEventLog_source_idx" ON "MetaCenterEventLog"("source");

INSERT INTO "MetaCenterSetting" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
