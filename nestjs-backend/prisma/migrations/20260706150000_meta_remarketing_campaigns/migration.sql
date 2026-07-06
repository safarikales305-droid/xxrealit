ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "creativeType" TEXT NOT NULL DEFAULT 'catalog_products';
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "targetingMode" TEXT NOT NULL DEFAULT 'map';
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "audienceId" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "creativePayload" JSONB;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaProductSetId" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaCreativeId" TEXT;

CREATE TABLE IF NOT EXISTS "MetaRemarketingAudience" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audienceType" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "estimatedCount" INTEGER,
    "metaEstimate" INTEGER,
    "metaAudienceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lastSyncedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MetaRemarketingAudience_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MetaRemarketingAudience_audienceType_idx" ON "MetaRemarketingAudience"("audienceType");
CREATE INDEX IF NOT EXISTS "MetaRemarketingAudience_status_idx" ON "MetaRemarketingAudience"("status");
CREATE INDEX IF NOT EXISTS "MetaRemarketingAudience_updatedAt_idx" ON "MetaRemarketingAudience"("updatedAt" DESC);
