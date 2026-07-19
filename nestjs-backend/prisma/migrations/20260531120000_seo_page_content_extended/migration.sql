-- Rozšíření SeoPageContent pro SEO centrum (editor, OG, schema, canonical)
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "h2" TEXT;
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "relatedLocations" JSONB;
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "relatedPages" JSONB;
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "canonical" TEXT;
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "robots" TEXT DEFAULT 'index,follow';
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "noindex" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "ogTitle" TEXT;
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "ogDescription" TEXT;
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "ogImage" TEXT;
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "twitterCard" TEXT DEFAULT 'summary_large_image';
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "schemaJson" JSONB;
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "altTexts" JSONB;
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "redirectTo" TEXT;
ALTER TABLE "SeoPageContent" ADD COLUMN IF NOT EXISTS "googleIndexed" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "SeoPageContent_noindex_idx" ON "SeoPageContent"("noindex");
