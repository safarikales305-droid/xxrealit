-- Unique account identifiers: WhatsApp verified phone + non-empty ICO

-- profileIco: empty string -> NULL, then unique (multiple NULL allowed)
UPDATE "User" SET "profileIco" = NULL WHERE "profileIco" IS NULL OR TRIM("profileIco") = '';

ALTER TABLE "User" ALTER COLUMN "profileIco" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "profileIco" DROP NOT NULL;

-- Resolve duplicate non-empty profileIco before unique index (keep oldest account)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "profileIco" ORDER BY "createdAt" ASC) AS rn
  FROM "User"
  WHERE "profileIco" IS NOT NULL AND TRIM("profileIco") <> ''
)
UPDATE "User" u
SET "profileIco" = NULL
FROM ranked r
WHERE u.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "User_profileIco_key" ON "User" ("profileIco");

-- whatsappVerifiedPhone: backfill from verified users, dedupe conflicts
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappVerifiedPhone" TEXT;

UPDATE "User"
SET "whatsappVerifiedPhone" = "whatsappPhone"
WHERE "whatsappVerified" = true
  AND "whatsappPhone" IS NOT NULL
  AND TRIM("whatsappPhone") <> ''
  AND ("whatsappVerifiedPhone" IS NULL OR TRIM("whatsappVerifiedPhone") = '');

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "whatsappVerifiedPhone" ORDER BY "createdAt" ASC) AS rn
  FROM "User"
  WHERE "whatsappVerifiedPhone" IS NOT NULL AND TRIM("whatsappVerifiedPhone") <> ''
)
UPDATE "User" u
SET
  "whatsappVerifiedPhone" = NULL,
  "whatsappVerified" = false,
  "whatsappVerifiedAt" = NULL
FROM ranked r
WHERE u.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "User_whatsappVerifiedPhone_key" ON "User" ("whatsappVerifiedPhone");
