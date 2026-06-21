-- Dedupe email, profileIco, whatsappVerifiedPhone before partial unique indexes.
-- Safe to run multiple times. Logs duplicates via RAISE NOTICE.

-- ========== EMAIL (case-insensitive) ==========
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT LOWER(TRIM(email)) AS norm_email,
           array_agg(id ORDER BY "createdAt" ASC, id ASC) AS user_ids,
           array_agg(email ORDER BY "createdAt" ASC, id ASC) AS emails
    FROM "User"
    WHERE email IS NOT NULL AND TRIM(email) <> ''
    GROUP BY LOWER(TRIM(email))
    HAVING COUNT(*) > 1
  LOOP
    RAISE NOTICE '[dedupe] duplicate email norm=% ids=% emails=%',
      rec.norm_email, rec.user_ids, rec.emails;
  END LOOP;
END $$;

WITH ranked AS (
  SELECT id,
         email,
         ROW_NUMBER() OVER (
           PARTITION BY LOWER(TRIM(email))
           ORDER BY "createdAt" ASC, id ASC
         ) AS rn
  FROM "User"
  WHERE email IS NOT NULL AND TRIM(email) <> ''
)
UPDATE "User" u
SET email = r.email || '__duplicate_' || (r.rn - 1)::text
FROM ranked r
WHERE u.id = r.id AND r.rn > 1;

-- ========== profileIco ==========
ALTER TABLE "User" ALTER COLUMN "profileIco" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "profileIco" DROP NOT NULL;

UPDATE "User"
SET "profileIco" = NULL
WHERE "profileIco" IS NOT NULL AND TRIM("profileIco") = '';

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT TRIM("profileIco") AS ico,
           array_agg(id ORDER BY "createdAt" ASC, id ASC) AS user_ids
    FROM "User"
    WHERE "profileIco" IS NOT NULL AND TRIM("profileIco") <> ''
    GROUP BY TRIM("profileIco")
    HAVING COUNT(*) > 1
  LOOP
    RAISE NOTICE '[dedupe] duplicate profileIco ico=% ids=%', rec.ico, rec.user_ids;
  END LOOP;
END $$;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY TRIM("profileIco")
           ORDER BY "createdAt" ASC, id ASC
         ) AS rn
  FROM "User"
  WHERE "profileIco" IS NOT NULL AND TRIM("profileIco") <> ''
)
UPDATE "User" u
SET "profileIco" = NULL
FROM ranked r
WHERE u.id = r.id AND r.rn > 1;

-- ========== whatsappVerifiedPhone ==========
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappVerifiedPhone" TEXT;

UPDATE "User"
SET "whatsappVerifiedPhone" = "whatsappPhone"
WHERE "whatsappVerified" = true
  AND "whatsappPhone" IS NOT NULL
  AND TRIM("whatsappPhone") <> ''
  AND ("whatsappVerifiedPhone" IS NULL OR TRIM("whatsappVerifiedPhone") = '');

UPDATE "User"
SET "whatsappVerifiedPhone" = NULL
WHERE "whatsappVerifiedPhone" IS NOT NULL AND TRIM("whatsappVerifiedPhone") = '';

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT TRIM("whatsappVerifiedPhone") AS phone,
           array_agg(id ORDER BY "createdAt" ASC, id ASC) AS user_ids
    FROM "User"
    WHERE "whatsappVerifiedPhone" IS NOT NULL AND TRIM("whatsappVerifiedPhone") <> ''
    GROUP BY TRIM("whatsappVerifiedPhone")
    HAVING COUNT(*) > 1
  LOOP
    RAISE NOTICE '[dedupe] duplicate whatsappVerifiedPhone phone=% ids=%',
      rec.phone, rec.user_ids;
  END LOOP;
END $$;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY TRIM("whatsappVerifiedPhone")
           ORDER BY "createdAt" ASC, id ASC
         ) AS rn
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

-- Drop legacy full-column indexes/constraints (may exist from partial failed deploy)
DROP INDEX IF EXISTS "User_profileIco_key";
DROP INDEX IF EXISTS "User_whatsappVerifiedPhone_key";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_profileIco_key";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_whatsappVerifiedPhone_key";

-- Partial unique indexes: only non-null, non-empty values
CREATE UNIQUE INDEX IF NOT EXISTS "User_profileIco_key"
  ON "User" ("profileIco")
  WHERE "profileIco" IS NOT NULL AND TRIM("profileIco") <> '';

CREATE UNIQUE INDEX IF NOT EXISTS "User_whatsappVerifiedPhone_key"
  ON "User" ("whatsappVerifiedPhone")
  WHERE "whatsappVerifiedPhone" IS NOT NULL AND TRIM("whatsappVerifiedPhone") <> '';
