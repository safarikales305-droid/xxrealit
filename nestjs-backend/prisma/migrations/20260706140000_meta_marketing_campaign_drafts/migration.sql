CREATE TABLE IF NOT EXISTS "MetaMarketingCampaignDraft" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
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
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MetaMarketingCampaignDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MetaMarketingCampaignDraft_status_idx"
  ON "MetaMarketingCampaignDraft"("status");
CREATE INDEX IF NOT EXISTS "MetaMarketingCampaignDraft_createdAt_idx"
  ON "MetaMarketingCampaignDraft"("createdAt" DESC);
