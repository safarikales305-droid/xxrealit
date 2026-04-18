-- Add portal/category metadata for scalable import administration
ALTER TABLE "ImportSource"
ADD COLUMN "portalKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN "portalLabel" TEXT NOT NULL DEFAULT '',
ADD COLUMN "categoryKey" TEXT NOT NULL DEFAULT 'obecne',
ADD COLUMN "categoryLabel" TEXT NOT NULL DEFAULT 'Obecné',
ADD COLUMN "listingType" TEXT,
ADD COLUMN "propertyType" TEXT,
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows
UPDATE "ImportSource"
SET
  "portalKey" = CASE
    WHEN "portal"::text = 'reality_cz' THEN 'reality_cz'
    WHEN "portal"::text = 'xml_feed' THEN 'xml_feed'
    WHEN "portal"::text = 'csv_feed' THEN 'csv_feed'
    ELSE 'other'
  END,
  "portalLabel" = CASE
    WHEN "portal"::text = 'reality_cz' THEN 'Reality.cz'
    WHEN "portal"::text = 'xml_feed' THEN 'XML feed'
    WHEN "portal"::text = 'csv_feed' THEN 'CSV'
    ELSE 'Jiný portál'
  END,
  "categoryKey" = CASE
    WHEN "portal"::text = 'reality_cz' AND "method"::text = 'soap' THEN 'soap-main'
    WHEN "portal"::text = 'reality_cz' THEN 'byty'
    WHEN "portal"::text = 'xml_feed' THEN 'obecne'
    WHEN "portal"::text = 'csv_feed' THEN 'obecne'
    ELSE 'ostatni'
  END,
  "categoryLabel" = CASE
    WHEN "portal"::text = 'reality_cz' AND "method"::text = 'soap' THEN 'SOAP hlavní'
    WHEN "portal"::text = 'reality_cz' THEN 'Byty'
    WHEN "portal"::text = 'xml_feed' THEN 'Obecné'
    WHEN "portal"::text = 'csv_feed' THEN 'Obecné'
    ELSE 'Ostatní'
  END,
  "sortOrder" = CASE
    WHEN "portal"::text = 'reality_cz' THEN 10
    WHEN "portal"::text = 'xml_feed' THEN 30
    WHEN "portal"::text = 'csv_feed' THEN 40
    ELSE 99
  END;

-- Ensure category from URL for existing reality scraper rows
UPDATE "ImportSource"
SET
  "categoryKey" = CASE
    WHEN COALESCE("endpointUrl", '') ILIKE '%/domy/%' THEN 'domy'
    WHEN COALESCE("endpointUrl", '') ILIKE '%/pozemky/%' THEN 'pozemky'
    WHEN COALESCE("endpointUrl", '') ILIKE '%/komercni/%' THEN 'komercni'
    WHEN COALESCE("endpointUrl", '') ILIKE '%/garaze/%' THEN 'garaze'
    WHEN COALESCE("endpointUrl", '') ILIKE '%/chaty/%' OR COALESCE("endpointUrl", '') ILIKE '%/chalupy/%' THEN 'chaty-chalupy'
    WHEN COALESCE("endpointUrl", '') ILIKE '%/byty/%' THEN 'byty'
    ELSE "categoryKey"
  END,
  "categoryLabel" = CASE
    WHEN COALESCE("endpointUrl", '') ILIKE '%/domy/%' THEN 'Domy'
    WHEN COALESCE("endpointUrl", '') ILIKE '%/pozemky/%' THEN 'Pozemky'
    WHEN COALESCE("endpointUrl", '') ILIKE '%/komercni/%' THEN 'Komerční'
    WHEN COALESCE("endpointUrl", '') ILIKE '%/garaze/%' THEN 'Garáže'
    WHEN COALESCE("endpointUrl", '') ILIKE '%/chaty/%' OR COALESCE("endpointUrl", '') ILIKE '%/chalupy/%' THEN 'Chaty a chalupy'
    WHEN COALESCE("endpointUrl", '') ILIKE '%/byty/%' THEN 'Byty'
    ELSE "categoryLabel"
  END
WHERE "portal"::text = 'reality_cz'
  AND "method"::text = 'scraper';

DROP INDEX IF EXISTS "import_source_portal_method_uq";
CREATE UNIQUE INDEX "import_source_portal_category_method_uq"
ON "ImportSource"("portalKey", "categoryKey", "method");

CREATE INDEX "ImportSource_portalKey_sortOrder_categoryLabel_idx"
ON "ImportSource"("portalKey", "sortOrder", "categoryLabel");

CREATE INDEX "ImportSource_portalKey_categoryKey_idx"
ON "ImportSource"("portalKey", "categoryKey");
