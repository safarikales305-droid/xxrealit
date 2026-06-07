-- Předgenerovaný statický JPG 1200×630 pro Facebook og:image
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "facebookShareImageUrl" TEXT;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "facebookShareImageAt" TIMESTAMP(3);
