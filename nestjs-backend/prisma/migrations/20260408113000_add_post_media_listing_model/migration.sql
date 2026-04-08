-- AlterTable
ALTER TABLE "Post"
ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "price" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "city" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Post"
ALTER COLUMN "description" SET DEFAULT '';

UPDATE "Post" SET "description" = '' WHERE "description" IS NULL;
ALTER TABLE "Post" ALTER COLUMN "description" SET NOT NULL;

UPDATE "Post" SET "type" = 'post' WHERE "type" IN ('text', 'video', 'image') OR "type" IS NULL;
ALTER TABLE "Post" ALTER COLUMN "type" SET DEFAULT 'post';

-- CreateTable
CREATE TABLE IF NOT EXISTS "Media" (
  "id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "postId" TEXT NOT NULL,
  CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- Index
CREATE INDEX IF NOT EXISTS "Media_postId_idx" ON "Media"("postId");
CREATE INDEX IF NOT EXISTS "Media_order_idx" ON "Media"("order");

-- Backfill legacy media
INSERT INTO "Media" ("id", "url", "type", "order", "postId")
SELECT ("id" || '-video'), "videoUrl", 'video', 0, "id"
FROM "Post"
WHERE "videoUrl" IS NOT NULL AND length(trim("videoUrl")) > 0
ON CONFLICT DO NOTHING;

INSERT INTO "Media" ("id", "url", "type", "order", "postId")
SELECT ("id" || '-image-1'), "imageUrl", 'image', 1, "id"
FROM "Post"
WHERE "imageUrl" IS NOT NULL AND length(trim("imageUrl")) > 0
ON CONFLICT DO NOTHING;
