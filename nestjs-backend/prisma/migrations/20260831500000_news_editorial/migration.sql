-- CreateEnum
CREATE TYPE "NewsSourceType" AS ENUM ('RSS', 'ATOM', 'API', 'OPEN_DATA', 'WEB_SOURCE');
CREATE TYPE "NewsSourceItemStatus" AS ENUM ('NEW', 'ANALYZED', 'IGNORED', 'DUPLICATE', 'MERGED', 'ERROR');
CREATE TYPE "NewsEditorialDecision" AS ENUM ('IGNORE', 'WATCH', 'CREATE_DRAFT', 'HIGH_PRIORITY');
CREATE TYPE "NewsArticleStatus" AS ENUM ('DRAFT', 'REVIEW', 'SCHEDULED', 'PUBLISHED', 'REJECTED', 'ARCHIVED');
CREATE TYPE "NewsPublishMode" AS ENUM ('MANUAL', 'AFTER_APPROVAL', 'AUTOMATIC');
CREATE TYPE "NewsWorkerJobType" AS ENUM ('SOURCE_FETCH', 'NEWS_ANALYSIS', 'ARTICLE_GENERATION', 'ARTICLE_QA', 'PUBLISH', 'SOCIAL_PUBLISH');
CREATE TYPE "NewsWorkerJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "NewsSourceHealth" AS ENUM ('ACTIVE', 'DEGRADED', 'DISABLED');

CREATE TABLE "NewsSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "NewsSourceType" NOT NULL,
    "category" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trustScore" INTEGER NOT NULL DEFAULT 80,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "language" TEXT NOT NULL DEFAULT 'cs',
    "checkIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "note" TEXT,
    "health" "NewsSourceHealth" NOT NULL DEFAULT 'ACTIVE',
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "itemsFoundTotal" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewsSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewsTopic" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "trendScore" INTEGER NOT NULL DEFAULT 0,
    "mergedSourceItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "region" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewsTopic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewsArticle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "seoTitle" TEXT NOT NULL,
    "seoDescription" TEXT NOT NULL,
    "perex" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "canonicalPath" TEXT,
    "ogImageUrl" TEXT,
    "ogImageAlt" TEXT,
    "category" TEXT NOT NULL DEFAULT 'reality',
    "region" TEXT,
    "status" "NewsArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "qualityScore" INTEGER,
    "relevanceScore" INTEGER,
    "seoScore" INTEGER,
    "publishMode" "NewsPublishMode",
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "sourcePublishedAt" TIMESTAMP(3),
    "indexable" BOOLEAN NOT NULL DEFAULT false,
    "robots" TEXT NOT NULL DEFAULT 'noindex,nofollow',
    "schemaJson" JSONB,
    "internalLinksJson" JSONB,
    "factClaimsJson" JSONB,
    "sourcesFooterHtml" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "uniqueViews" INTEGER NOT NULL DEFAULT 0,
    "topicId" TEXT,
    "portalPostId" TEXT,
    "facebookQueued" BOOLEAN NOT NULL DEFAULT false,
    "authorLabel" TEXT NOT NULL DEFAULT 'Redakce XXREALIT',
    "aiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "editorNotes" TEXT,
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewsSourceItem" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "author" TEXT,
    "imageUrl" TEXT,
    "rawMetadata" JSONB,
    "contentHash" TEXT NOT NULL,
    "titleFingerprint" TEXT,
    "status" "NewsSourceItemStatus" NOT NULL DEFAULT 'NEW',
    "relevanceScore" INTEGER,
    "seoPotential" INTEGER,
    "userInterest" INTEGER,
    "freshnessScore" INTEGER,
    "trustScore" INTEGER,
    "trendScore" INTEGER NOT NULL DEFAULT 0,
    "editorialDecision" "NewsEditorialDecision",
    "topicId" TEXT,
    "duplicateOfId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewsSourceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewsArticleSource" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceItemId" TEXT,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourcePublishedAt" TIMESTAMP(3),
    CONSTRAINT "NewsArticleSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewsArticleAnalytics" (
    "articleId" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "uniqueViews" INTEGER NOT NULL DEFAULT 0,
    "ctrListings" INTEGER NOT NULL DEFAULT 0,
    "ctrCompanies" INTEGER NOT NULL DEFAULT 0,
    "ctrRegistration" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "avgReadSeconds" INTEGER,
    "organicVisits" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewsArticleAnalytics_pkey" PRIMARY KEY ("articleId")
);

CREATE TABLE "NewsWorkerJob" (
    "id" TEXT NOT NULL,
    "type" "NewsWorkerJobType" NOT NULL,
    "status" "NewsWorkerJobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewsWorkerJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewsAuditLog" (
    "id" TEXT NOT NULL,
    "articleId" TEXT,
    "event" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsSource_url_key" ON "NewsSource"("url");
CREATE INDEX "NewsSource_enabled_priority_idx" ON "NewsSource"("enabled", "priority");
CREATE UNIQUE INDEX "NewsTopic_slug_key" ON "NewsTopic"("slug");
CREATE INDEX "NewsTopic_status_trendScore_idx" ON "NewsTopic"("status", "trendScore");
CREATE UNIQUE INDEX "NewsArticle_slug_key" ON "NewsArticle"("slug");
CREATE UNIQUE INDEX "NewsArticle_topicId_key" ON "NewsArticle"("topicId");
CREATE INDEX "NewsArticle_status_publishedAt_idx" ON "NewsArticle"("status", "publishedAt");
CREATE INDEX "NewsArticle_category_status_idx" ON "NewsArticle"("category", "status");
CREATE INDEX "NewsArticle_indexable_publishedAt_idx" ON "NewsArticle"("indexable", "publishedAt");
CREATE UNIQUE INDEX "NewsSourceItem_sourceId_contentHash_key" ON "NewsSourceItem"("sourceId", "contentHash");
CREATE INDEX "NewsSourceItem_sourceId_externalId_idx" ON "NewsSourceItem"("sourceId", "externalId");
CREATE INDEX "NewsSourceItem_status_fetchedAt_idx" ON "NewsSourceItem"("status", "fetchedAt");
CREATE INDEX "NewsSourceItem_topicId_idx" ON "NewsSourceItem"("topicId");
CREATE INDEX "NewsSourceItem_canonicalUrl_idx" ON "NewsSourceItem"("canonicalUrl");
CREATE INDEX "NewsArticleSource_articleId_idx" ON "NewsArticleSource"("articleId");
CREATE INDEX "NewsWorkerJob_type_status_createdAt_idx" ON "NewsWorkerJob"("type", "status", "createdAt");
CREATE INDEX "NewsAuditLog_event_createdAt_idx" ON "NewsAuditLog"("event", "createdAt");
CREATE INDEX "NewsAuditLog_articleId_createdAt_idx" ON "NewsAuditLog"("articleId", "createdAt");

ALTER TABLE "NewsSourceItem" ADD CONSTRAINT "NewsSourceItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NewsSourceItem" ADD CONSTRAINT "NewsSourceItem_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "NewsTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NewsArticle" ADD CONSTRAINT "NewsArticle_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "NewsTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NewsArticleSource" ADD CONSTRAINT "NewsArticleSource_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NewsArticleSource" ADD CONSTRAINT "NewsArticleSource_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "NewsSourceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NewsArticleAnalytics" ADD CONSTRAINT "NewsArticleAnalytics_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NewsAuditLog" ADD CONSTRAINT "NewsAuditLog_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "NewsArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
