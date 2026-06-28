-- Property SEO fields + global SeoSettings
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "seoTitle" TEXT;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "seoKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX IF NOT EXISTS "Property_slug_key" ON "Property"("slug");

CREATE TABLE IF NOT EXISTS "SeoSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "defaultTitle" TEXT NOT NULL DEFAULT 'XXREALIT | Moderní realitní portál s video inzeráty',
  "defaultDescription" TEXT NOT NULL DEFAULT 'XXREALIT je moderní realitní portál propojující video inzeráty, klasickou inzerci, makléře, stavební firmy, finanční poradce a investory.',
  "defaultKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "defaultOgImageUrl" TEXT,
  "robotsIndex" BOOLEAN NOT NULL DEFAULT true,
  "googleAnalyticsId" TEXT,
  "googleTagManagerId" TEXT,
  "googleSearchConsoleVerification" TEXT,
  "metaPixelId" TEXT,
  "seznamWebmasterVerification" TEXT,
  "bingWebmasterVerification" TEXT,
  "yandexVerification" TEXT,
  "pinterestVerification" TEXT,
  "tiktokPixelId" TEXT,
  "linkedInInsightId" TEXT,
  "cookieConsentEnabled" BOOLEAN NOT NULL DEFAULT true,
  "hreflangLocales" TEXT[] DEFAULT ARRAY['cs','en','de','pl']::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeoSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SeoSettings" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING;
