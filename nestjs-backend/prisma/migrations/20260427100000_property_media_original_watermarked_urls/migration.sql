-- PropertyMedia: columns expected by Prisma schema (mirror + watermark pipeline).
-- Production DBs created from 20260408140000_add_property_media only had url/type/sortOrder.
ALTER TABLE "PropertyMedia" ADD COLUMN IF NOT EXISTS "originalUrl" TEXT;
ALTER TABLE "PropertyMedia" ADD COLUMN IF NOT EXISTS "watermarkedUrl" TEXT;
