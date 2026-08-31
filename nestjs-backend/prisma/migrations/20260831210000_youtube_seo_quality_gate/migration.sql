-- CreateEnum
CREATE TYPE "EditorialContentMode" AS ENUM ('SHORTS_ONLY', 'POST_AND_SHORTS', 'ARTICLE_FEATURE');

-- AlterTable
ALTER TABLE "Post" ADD COLUMN "editorialContentMode" "EditorialContentMode" NOT NULL DEFAULT 'SHORTS_ONLY';
ALTER TABLE "Post" ADD COLUMN "seoQualityScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Post" ADD COLUMN "isIndexable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN "robots" TEXT;
ALTER TABLE "Post" ADD COLUMN "canonicalPath" TEXT;
ALTER TABLE "Post" ADD COLUMN "editorialTopicCluster" TEXT;
ALTER TABLE "Post" ADD COLUMN "editorialLocation" TEXT;
ALTER TABLE "Post" ADD COLUMN "editorialLocationConfidence" DOUBLE PRECISION;
ALTER TABLE "Post" ADD COLUMN "editorialH1" TEXT;
ALTER TABLE "Post" ADD COLUMN "editorialPerex" TEXT;
ALTER TABLE "Post" ADD COLUMN "editorialBodyMarkdown" TEXT;
ALTER TABLE "Post" ADD COLUMN "editorialSeoDiagnosticsJson" JSONB;
ALTER TABLE "Post" ADD COLUMN "editorialRelatedPostIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Post" ADD COLUMN "editorialInternalLinksJson" JSONB;
ALTER TABLE "Post" ADD COLUMN "duplicateTopicBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN "contentModeManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN "indexableManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN "editorialSchemaJson" JSONB;
ALTER TABLE "Post" ADD COLUMN "editorialOgImageUrl" TEXT;

-- CreateIndex
CREATE INDEX "Post_editorialContentMode_seoQualityScore_idx" ON "Post"("editorialContentMode", "seoQualityScore");
CREATE INDEX "Post_editorialTopicCluster_idx" ON "Post"("editorialTopicCluster");
CREATE INDEX "Post_isIndexable_publishedAt_idx" ON "Post"("isIndexable", "publishedAt");
