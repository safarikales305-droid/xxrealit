-- Find Media rows whose postId does not exist in Post (run before adding Media_postId_fkey).
-- Usage (production): psql "$DATABASE_URL" -f prisma/scripts/repair-media-post-orphans.sql

SELECT 'Media' AS "table", m."id", m."postId", m."url"
FROM "Media" AS m
LEFT JOIN "Post" AS p ON p."id" = m."postId"
WHERE p."id" IS NULL

UNION ALL

SELECT 'WhatsAppMessage' AS "table", w."id", w."postId", w."notificationType"
FROM "WhatsAppMessage" AS w
LEFT JOIN "Post" AS p ON p."id" = w."postId"
WHERE w."postId" IS NOT NULL AND p."id" IS NULL

ORDER BY 1, 2;

-- Orphans cleanup (matches migrations — no full DB reset):
-- DELETE FROM "Media" WHERE NOT EXISTS (SELECT 1 FROM "Post" p WHERE p."id" = "Media"."postId");
-- UPDATE "WhatsAppMessage" SET "postId" = NULL WHERE "postId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Post" p WHERE p."id" = "WhatsAppMessage"."postId");
