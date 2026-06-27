-- Analytics settings singleton
CREATE TABLE IF NOT EXISTS "AnalyticsSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "anonymizeIp" BOOLEAN NOT NULL DEFAULT false,
    "excludeStaff" BOOLEAN NOT NULL DEFAULT true,
    "trackingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AnalyticsSettings" ("id", "anonymizeIp", "excludeStaff", "trackingEnabled", "updatedAt")
VALUES ('default', false, true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "AnalyticsSession" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "deviceType" TEXT NOT NULL DEFAULT 'desktop',
    "browser" TEXT NOT NULL DEFAULT '',
    "os" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "referrer" TEXT NOT NULL DEFAULT '',
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "pageViewCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AnalyticsPageView" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "referrer" TEXT NOT NULL DEFAULT '',
    "previousPath" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsPageView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AnalyticsSession_visitorId_idx" ON "AnalyticsSession"("visitorId");
CREATE INDEX IF NOT EXISTS "AnalyticsSession_userId_idx" ON "AnalyticsSession"("userId");
CREATE INDEX IF NOT EXISTS "AnalyticsSession_lastSeenAt_idx" ON "AnalyticsSession"("lastSeenAt");
CREATE INDEX IF NOT EXISTS "AnalyticsSession_firstSeenAt_idx" ON "AnalyticsSession"("firstSeenAt");
CREATE INDEX IF NOT EXISTS "AnalyticsSession_country_city_idx" ON "AnalyticsSession"("country", "city");

CREATE INDEX IF NOT EXISTS "AnalyticsPageView_sessionId_createdAt_idx" ON "AnalyticsPageView"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsPageView_path_createdAt_idx" ON "AnalyticsPageView"("path", "createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsPageView_createdAt_idx" ON "AnalyticsPageView"("createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsPageView_userId_createdAt_idx" ON "AnalyticsPageView"("userId", "createdAt");

ALTER TABLE "AnalyticsSession" DROP CONSTRAINT IF EXISTS "AnalyticsSession_userId_fkey";
ALTER TABLE "AnalyticsSession" ADD CONSTRAINT "AnalyticsSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AnalyticsPageView" DROP CONSTRAINT IF EXISTS "AnalyticsPageView_sessionId_fkey";
ALTER TABLE "AnalyticsPageView" ADD CONSTRAINT "AnalyticsPageView_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AnalyticsSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
