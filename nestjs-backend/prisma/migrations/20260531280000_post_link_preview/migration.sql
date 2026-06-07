-- Náhled externího odkazu v komunitních příspěvcích
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "externalUrl" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "previewTitle" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "previewDescription" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "previewImage" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "previewSiteName" TEXT;
