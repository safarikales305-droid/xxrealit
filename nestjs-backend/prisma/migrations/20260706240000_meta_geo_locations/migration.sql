CREATE TABLE IF NOT EXISTS "MetaGeoLocation" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "metaKey" TEXT NOT NULL,
    "country" TEXT,
    "region" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetaGeoLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MetaGeoLocation_metaKey_key" ON "MetaGeoLocation"("metaKey");
CREATE INDEX IF NOT EXISTS "MetaGeoLocation_city_idx" ON "MetaGeoLocation"("city");

ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaGeoKey" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaGeoCountry" TEXT;
ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaGeoRegion" TEXT;
