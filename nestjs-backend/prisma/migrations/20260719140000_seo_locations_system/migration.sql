-- SEO locations, redirects, page content workflow, property location link

CREATE TYPE "SeoLocationKind" AS ENUM (
  'KRAJ',
  'OKRES',
  'ORP',
  'MESTO',
  'MESTYS',
  'OBEC',
  'MESTSKA_CAST',
  'CAST_OBCE',
  'KATASTR',
  'PSC',
  'LOKALITA'
);

CREATE TYPE "SeoContentStatus" AS ENUM (
  'DRAFT',
  'REVIEW',
  'APPROVED',
  'PUBLISHED',
  'LOCKED'
);

CREATE TABLE IF NOT EXISTS "SeoLocation" (
  "id" TEXT NOT NULL,
  "officialCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "slugAscii" TEXT NOT NULL,
  "locative" TEXT NOT NULL DEFAULT '',
  "kind" "SeoLocationKind" NOT NULL,
  "parentId" TEXT,
  "regionId" TEXT,
  "districtId" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "population" INTEGER,
  "psc" TEXT,
  "cadastreCode" TEXT,
  "searchTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "importedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeoLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SeoLocation_officialCode_key" ON "SeoLocation"("officialCode");
CREATE UNIQUE INDEX IF NOT EXISTS "SeoLocation_slug_key" ON "SeoLocation"("slug");
CREATE INDEX IF NOT EXISTS "SeoLocation_kind_idx" ON "SeoLocation"("kind");
CREATE INDEX IF NOT EXISTS "SeoLocation_slugAscii_idx" ON "SeoLocation"("slugAscii");
CREATE INDEX IF NOT EXISTS "SeoLocation_parentId_idx" ON "SeoLocation"("parentId");
CREATE INDEX IF NOT EXISTS "SeoLocation_regionId_idx" ON "SeoLocation"("regionId");
CREATE INDEX IF NOT EXISTS "SeoLocation_districtId_idx" ON "SeoLocation"("districtId");
CREATE INDEX IF NOT EXISTS "SeoLocation_isActive_idx" ON "SeoLocation"("isActive");

ALTER TABLE "SeoLocation"
  ADD CONSTRAINT "SeoLocation_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "SeoLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SeoLocation"
  ADD CONSTRAINT "SeoLocation_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "SeoLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SeoLocation"
  ADD CONSTRAINT "SeoLocation_districtId_fkey"
  FOREIGN KEY ("districtId") REFERENCES "SeoLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SeoLocationImportRun" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "source" TEXT,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "inserted" INTEGER NOT NULL DEFAULT 0,
  "updated" INTEGER NOT NULL DEFAULT 0,
  "deactivated" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "errors" JSONB,
  "progressPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "SeoLocationImportRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SeoLocationImportRun_startedAt_idx" ON "SeoLocationImportRun"("startedAt" DESC);

CREATE TABLE IF NOT EXISTS "SeoRedirect" (
  "id" TEXT NOT NULL,
  "fromPath" TEXT NOT NULL,
  "toPath" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL DEFAULT 301,
  "reason" TEXT,
  "locationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeoRedirect_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SeoRedirect_fromPath_key" ON "SeoRedirect"("fromPath");
CREATE INDEX IF NOT EXISTS "SeoRedirect_locationId_idx" ON "SeoRedirect"("locationId");

ALTER TABLE "SeoRedirect"
  ADD CONSTRAINT "SeoRedirect_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "SeoLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SeoPageContent" (
  "id" TEXT NOT NULL,
  "pageKey" TEXT NOT NULL,
  "intentSlug" TEXT,
  "locationId" TEXT,
  "status" "SeoContentStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT,
  "description" TEXT,
  "h1" TEXT,
  "bodyText" TEXT,
  "faq" JSONB,
  "internalLinks" JSONB,
  "isLocked" BOOLEAN NOT NULL DEFAULT false,
  "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
  "qualityScore" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeoPageContent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SeoPageContent_pageKey_key" ON "SeoPageContent"("pageKey");
CREATE INDEX IF NOT EXISTS "SeoPageContent_locationId_idx" ON "SeoPageContent"("locationId");
CREATE INDEX IF NOT EXISTS "SeoPageContent_intentSlug_idx" ON "SeoPageContent"("intentSlug");
CREATE INDEX IF NOT EXISTS "SeoPageContent_status_idx" ON "SeoPageContent"("status");

ALTER TABLE "SeoPageContent"
  ADD CONSTRAINT "SeoPageContent_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "SeoLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SeoPageContentVersion" (
  "id" TEXT NOT NULL,
  "contentId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdBy" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeoPageContentVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SeoPageContentVersion_contentId_version_key"
  ON "SeoPageContentVersion"("contentId", "version");
CREATE INDEX IF NOT EXISTS "SeoPageContentVersion_contentId_idx" ON "SeoPageContentVersion"("contentId");

ALTER TABLE "SeoPageContentVersion"
  ADD CONSTRAINT "SeoPageContentVersion_contentId_fkey"
  FOREIGN KEY ("contentId") REFERENCES "SeoPageContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SeoPageAnalytics" (
  "id" TEXT NOT NULL,
  "pageKey" TEXT NOT NULL,
  "locationId" TEXT,
  "organicVisits" INTEGER NOT NULL DEFAULT 0,
  "listingCount" INTEGER NOT NULL DEFAULT 0,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "ctr" DOUBLE PRECISION,
  "avgPosition" DOUBLE PRECISION,
  "conversions" INTEGER NOT NULL DEFAULT 0,
  "qualityScore" INTEGER NOT NULL DEFAULT 0,
  "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeoPageAnalytics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SeoPageAnalytics_pageKey_idx" ON "SeoPageAnalytics"("pageKey");
CREATE INDEX IF NOT EXISTS "SeoPageAnalytics_locationId_idx" ON "SeoPageAnalytics"("locationId");
CREATE INDEX IF NOT EXISTS "SeoPageAnalytics_measuredAt_idx" ON "SeoPageAnalytics"("measuredAt" DESC);

ALTER TABLE "SeoPageAnalytics"
  ADD CONSTRAINT "SeoPageAnalytics_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "SeoLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "seoLocationId" TEXT;
CREATE INDEX IF NOT EXISTS "Property_seoLocationId_idx" ON "Property"("seoLocationId");

ALTER TABLE "Property"
  ADD CONSTRAINT "Property_seoLocationId_fkey"
  FOREIGN KEY ("seoLocationId") REFERENCES "SeoLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
