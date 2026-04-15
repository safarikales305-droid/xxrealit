-- Add phone fields and enforce non-empty display name.
ALTER TABLE "User"
ADD COLUMN "phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN "phonePublic" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
SET "name" = split_part("email", '@', 1)
WHERE "name" IS NULL OR btrim("name") = '';

ALTER TABLE "User"
ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "name" SET DEFAULT '';
