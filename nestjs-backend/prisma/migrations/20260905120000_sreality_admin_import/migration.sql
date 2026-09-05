-- Sreality admin import: enum value, draft preview, property AI reels, source status

ALTER TYPE "ListingImportPortal" ADD VALUE IF NOT EXISTS 'sreality';

CREATE TYPE "ImportSourceAvailabilityStatus" AS ENUM ('AVAILABLE', 'SOURCE_UNAVAILABLE');

ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "importOriginalDescription" TEXT;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "importSourceStatus" "ImportSourceAvailabilityStatus" DEFAULT 'AVAILABLE';

ALTER TABLE "AiInfluencerReelJob" ALTER COLUMN "articleId" DROP NOT NULL;
ALTER TABLE "AiInfluencerReelJob" ADD COLUMN IF NOT EXISTS "propertyId" TEXT;

ALTER TABLE "AiInfluencerReelJob"
  ADD CONSTRAINT "AiInfluencerReelJob_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "AiInfluencerReelJob_propertyId_idx" ON "AiInfluencerReelJob"("propertyId");

CREATE TABLE IF NOT EXISTS "SrealityImportDraft" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourceExternalId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'preview',
  "prefillJson" JSONB NOT NULL,
  "brokerJson" JSONB,
  "imagesJson" JSONB NOT NULL DEFAULT '[]',
  "imageImportStats" JSONB,
  "aiTextJson" JSONB,
  "brokerMatchStatus" TEXT NOT NULL DEFAULT 'NOT_FOUND',
  "matchedBrokerContactId" TEXT,
  "propertyId" TEXT,
  "settingsJson" JSONB,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SrealityImportDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SrealityImportDraft_adminUserId_idx" ON "SrealityImportDraft"("adminUserId");
CREATE INDEX IF NOT EXISTS "SrealityImportDraft_sourceUrl_idx" ON "SrealityImportDraft"("sourceUrl");
CREATE INDEX IF NOT EXISTS "SrealityImportDraft_sourceExternalId_idx" ON "SrealityImportDraft"("sourceExternalId");
CREATE INDEX IF NOT EXISTS "SrealityImportDraft_propertyId_idx" ON "SrealityImportDraft"("propertyId");
CREATE INDEX IF NOT EXISTS "SrealityImportDraft_status_idx" ON "SrealityImportDraft"("status");

ALTER TABLE "SrealityImportDraft"
  ADD CONSTRAINT "SrealityImportDraft_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
