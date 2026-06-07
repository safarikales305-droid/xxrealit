-- Doplnění OG polí u existujících inzerátů (Shorts bez thumbnailUrl).
UPDATE "Property"
SET "mainImage" = "images"[1]
WHERE "mainImage" IS NULL
  AND array_length("images", 1) > 0;

UPDATE "Property"
SET "generatedVideoThumbnail" = NULL
WHERE "generatedVideoThumbnail" IS NOT NULL
  AND trim("generatedVideoThumbnail") = '';

UPDATE "Property"
SET "thumbnailUrl" = COALESCE(
  NULLIF(trim("thumbnailUrl"), ''),
  NULLIF(trim("generatedVideoThumbnail"), ''),
  NULLIF(trim("mainImage"), ''),
  CASE WHEN array_length("images", 1) > 0 THEN "images"[1] ELSE NULL END
)
WHERE "thumbnailUrl" IS NULL OR trim("thumbnailUrl") = '';
