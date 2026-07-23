-- Programatické SEO nastavení v SeoSettings
ALTER TABLE "SeoSettings" ADD COLUMN IF NOT EXISTS "programmaticGenerateWithoutListings" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SeoSettings" ADD COLUMN IF NOT EXISTS "programmaticAutoEnrichWithListings" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SeoSettings" ADD COLUMN IF NOT EXISTS "programmaticAutoRegenerateOnDataChange" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SeoSettings" ADD COLUMN IF NOT EXISTS "programmaticDuplicateContentCheck" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SeoSettings" ADD COLUMN IF NOT EXISTS "programmaticSeoScoreCheck" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SeoSettings" ADD COLUMN IF NOT EXISTS "programmaticIndexationCheck" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SeoSettings" ADD COLUMN IF NOT EXISTS "programmaticPreviewBeforePublish" BOOLEAN NOT NULL DEFAULT false;
