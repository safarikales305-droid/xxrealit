-- Post SEO slugs
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "seoTitle" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Post_slug_key" ON "Post"("slug");
CREATE INDEX IF NOT EXISTS "Post_slug_idx" ON "Post"("slug");

-- SeoSettings Google Indexing API
ALTER TABLE "SeoSettings" ADD COLUMN IF NOT EXISTS "googleIndexingApiEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SeoSettings" ADD COLUMN IF NOT EXISTS "googleIndexingServiceAccountJson" TEXT;

-- Seo index queue
CREATE TYPE "SeoIndexContentType" AS ENUM ('POST', 'VIDEO_POST', 'PROPERTY', 'SHORTS');
CREATE TYPE "SeoIndexStatus" AS ENUM ('PENDING', 'SUBMITTED', 'INDEXED', 'FAILED');

CREATE TABLE IF NOT EXISTS "SeoIndexQueue" (
    "id" TEXT NOT NULL,
    "contentType" "SeoIndexContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "inSitemap" BOOLEAN NOT NULL DEFAULT true,
    "status" "SeoIndexStatus" NOT NULL DEFAULT 'PENDING',
    "lastSubmittedAt" TIMESTAMP(3),
    "lastIndexedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoIndexQueue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SeoIndexQueue_contentType_contentId_key" ON "SeoIndexQueue"("contentType", "contentId");
CREATE INDEX IF NOT EXISTS "SeoIndexQueue_status_idx" ON "SeoIndexQueue"("status");
CREATE INDEX IF NOT EXISTS "SeoIndexQueue_contentId_idx" ON "SeoIndexQueue"("contentId");
