-- Preferuj první fotku galerie jako thumbnailUrl (místo bílého video snímku).
UPDATE "Property"
SET "thumbnailUrl" = "images"[1]
WHERE array_length("images", 1) > 0
  AND (
    "thumbnailUrl" IS NULL
    OR trim("thumbnailUrl") = ''
    OR "thumbnailUrl" = "generatedVideoThumbnail"
  );
