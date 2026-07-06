-- Idempotent: Meta Marketing kampaně + remarketing publika (Meta Centrum XXREALIT)
CREATE TABLE IF NOT EXISTS "MetaMarketingCampaignDraft" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "creativeType" TEXT NOT NULL DEFAULT 'catalog_products',
    "targetingMode" TEXT NOT NULL DEFAULT 'map',
    "audienceId" TEXT,
    "creativePayload" JSONB,
    "adAccountId" TEXT,
    "catalogId" TEXT,
    "datasetId" TEXT,
    "propertyType" TEXT,
    "cityName" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radiusKm" INTEGER,
    "dailyBudgetCzk" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "selectedProductIds" JSONB NOT NULL DEFAULT '[]',
    "metaCampaignId" TEXT,
    "metaAdSetId" TEXT,
    "metaAdId" TEXT,
    "metaProductSetId" TEXT,
    "metaCreativeId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetaMarketingCampaignDraft_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "creativeType" TEXT NOT NULL DEFAULT 'catalog_products';
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "targetingMode" TEXT NOT NULL DEFAULT 'map';
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "audienceId" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "creativePayload" JSONB;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaProductSetId" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaCreativeId" TEXT;

CREATE INDEX IF NOT EXISTS "MetaMarketingCampaignDraft_status_idx"
  ON "MetaMarketingCampaignDraft"("status");
CREATE INDEX IF NOT EXISTS "MetaMarketingCampaignDraft_createdAt_idx"
  ON "MetaMarketingCampaignDraft"("createdAt" DESC);

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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetaRemarketingAudience_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MetaRemarketingAudience_audienceType_idx"
  ON "MetaRemarketingAudience"("audienceType");
CREATE INDEX IF NOT EXISTS "MetaRemarketingAudience_status_idx"
  ON "MetaRemarketingAudience"("status");
CREATE INDEX IF NOT EXISTS "MetaRemarketingAudience_updatedAt_idx"
  ON "MetaRemarketingAudience"("updatedAt" DESC);
