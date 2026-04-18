-- Klasifikace importovaných inzerátů + typ zdroje pro shorts

CREATE TYPE "PropertyShortsSourceType" AS ENUM ('video', 'images', 'none');

ALTER TABLE "Property" ADD COLUMN "sourcePortalKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Property" ADD COLUMN "sourcePortalLabel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Property" ADD COLUMN "propertyTypeKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Property" ADD COLUMN "propertyTypeLabel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Property" ADD COLUMN "importCategoryKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Property" ADD COLUMN "importCategoryLabel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Property" ADD COLUMN "canGenerateShorts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Property" ADD COLUMN "shortsGenerated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Property" ADD COLUMN "shortsSourceType" "PropertyShortsSourceType" NOT NULL DEFAULT 'none';

CREATE INDEX "Property_sourcePortalKey_propertyTypeKey_city_idx" ON "Property" ("sourcePortalKey", "propertyTypeKey", "city");
CREATE INDEX "Property_importCategoryKey_sourcePortalKey_idx" ON "Property" ("importCategoryKey", "sourcePortalKey");

-- Backfill portálu z enumu importSource
UPDATE "Property" SET
  "sourcePortalKey" = CASE "importSource"::text
    WHEN 'reality_cz' THEN 'reality_cz'
    WHEN 'xml_feed' THEN 'xml_feed'
    WHEN 'csv_feed' THEN 'csv_feed'
    WHEN 'other' THEN 'other'
    ELSE ''
  END,
  "sourcePortalLabel" = CASE "importSource"::text
    WHEN 'reality_cz' THEN 'Reality.cz'
    WHEN 'xml_feed' THEN 'XML feed'
    WHEN 'csv_feed' THEN 'CSV'
    WHEN 'other' THEN 'Jiný portál'
    ELSE ''
  END
WHERE "importSource" IS NOT NULL;

-- Odhad shorts zdroje z existujících dat (video URL / počet fotek)
UPDATE "Property" SET
  "shortsSourceType" = CASE
    WHEN "videoUrl" IS NOT NULL AND btrim("videoUrl") <> '' AND lower(btrim("videoUrl")) LIKE 'http%'
      THEN 'video'::"PropertyShortsSourceType"
    WHEN coalesce(cardinality("images"), 0) >= 2
      THEN 'images'::"PropertyShortsSourceType"
    ELSE 'none'::"PropertyShortsSourceType"
  END,
  "canGenerateShorts" = (
    ("videoUrl" IS NOT NULL AND btrim("videoUrl") <> '' AND lower(btrim("videoUrl")) LIKE 'http%')
    OR coalesce(cardinality("images"), 0) >= 2
  );

-- Jednoduchý odhad propertyTypeKey z textu (doplní příští import přesněji)
UPDATE "Property" SET
  "propertyTypeKey" = CASE
    WHEN lower(coalesce("title", '') || ' ' || coalesce("description", '') || ' ' || coalesce("propertyType", '')) LIKE '%byt%'
      OR lower(coalesce("importSourceUrl", '')) LIKE '%/byty/%'
      THEN 'byt'
    WHEN lower(coalesce("title", '') || ' ' || coalesce("description", '') || ' ' || coalesce("propertyType", '')) LIKE '%dům%'
      OR lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%dum%'
      OR lower(coalesce("importSourceUrl", '')) LIKE '%/domy/%'
      THEN 'dum'
    WHEN lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%pozem%'
      OR lower(coalesce("importSourceUrl", '')) LIKE '%/pozemky/%'
      THEN 'pozemek'
    WHEN lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%garáž%'
      OR lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%garaz%'
      OR lower(coalesce("importSourceUrl", '')) LIKE '%/garaze/%'
      THEN 'garaz'
    WHEN lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%komer%'
      OR lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%kancelář%'
      OR lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%obchodní prostor%'
      OR lower(coalesce("importSourceUrl", '')) LIKE '%/komercni/%'
      THEN 'komercni'
    WHEN lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%chata%'
      OR lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%chalupa%'
      OR lower(coalesce("importSourceUrl", '')) LIKE '%/chaty/%'
      OR lower(coalesce("importSourceUrl", '')) LIKE '%/chalupy/%'
      THEN 'chata_chalupa'
    ELSE 'ostatni'
  END,
  "propertyTypeLabel" = CASE
    WHEN lower(coalesce("title", '') || ' ' || coalesce("description", '') || ' ' || coalesce("propertyType", '')) LIKE '%byt%'
      OR lower(coalesce("importSourceUrl", '')) LIKE '%/byty/%'
      THEN 'Byty'
    WHEN lower(coalesce("title", '') || ' ' || coalesce("description", '') || ' ' || coalesce("propertyType", '')) LIKE '%dům%'
      OR lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%dum%'
      OR lower(coalesce("importSourceUrl", '')) LIKE '%/domy/%'
      THEN 'Domy'
    WHEN lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%pozem%'
      OR lower(coalesce("importSourceUrl", '')) LIKE '%/pozemky/%'
      THEN 'Pozemky'
    WHEN lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%garáž%'
      OR lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%garaz%'
      OR lower(coalesce("importSourceUrl", '')) LIKE '%/garaze/%'
      THEN 'Garáže'
    WHEN lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%komer%'
      OR lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%kancelář%'
      OR lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%obchodní prostor%'
      OR lower(coalesce("importSourceUrl", '')) LIKE '%/komercni/%'
      THEN 'Komerční'
    WHEN lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%chata%'
      OR lower(coalesce("title", '') || ' ' || coalesce("description", '')) LIKE '%chalupa%'
      OR lower(coalesce("importSourceUrl", '')) LIKE '%/chaty/%'
      OR lower(coalesce("importSourceUrl", '')) LIKE '%/chalupy/%'
      THEN 'Chaty a chalupy'
    ELSE 'Ostatní'
  END
WHERE "importSource" IS NOT NULL;

UPDATE "Property" SET
  "importCategoryKey" = "propertyTypeKey",
  "importCategoryLabel" = "propertyTypeLabel"
WHERE "importSource" IS NOT NULL AND ("importCategoryKey" = '' OR "importCategoryKey" IS NULL);
