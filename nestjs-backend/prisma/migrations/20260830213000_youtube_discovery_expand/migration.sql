-- CreateTable YouTubeDiscoveryRun
CREATE TABLE IF NOT EXISTS "YouTubeDiscoveryRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "triggeredBy" TEXT NOT NULL DEFAULT 'admin',
    "categorySlug" TEXT,
    "queriesCount" INTEGER NOT NULL DEFAULT 0,
    "rawResults" INTEGER NOT NULL DEFAULT 0,
    "uniqueChannels" INTEGER NOT NULL DEFAULT 0,
    "existingSources" INTEGER NOT NULL DEFAULT 0,
    "existingCandidates" INTEGER NOT NULL DEFAULT 0,
    "belowThreshold" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "newCandidates" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "searchRequests" INTEGER NOT NULL DEFAULT 0,
    "diagnosticsJson" JSONB,

    CONSTRAINT "YouTubeDiscoveryRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "YouTubeDiscoveryRun_startedAt_idx" ON "YouTubeDiscoveryRun"("startedAt");
