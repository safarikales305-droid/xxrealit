-- CreateTable
CREATE TABLE "PortalPresentationPage" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'cs',
    "slug" TEXT NOT NULL DEFAULT 'o-portalu',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "metaTitle" TEXT NOT NULL,
    "metaDescription" TEXT NOT NULL,
    "metaKeywords" TEXT,
    "ogImageUrl" TEXT,
    "canonicalUrl" TEXT,
    "heroTitle" TEXT NOT NULL,
    "heroSubtitle" TEXT NOT NULL,
    "heroCtaLabel" TEXT,
    "heroCtaUrl" TEXT,
    "heroSecondaryCtaLabel" TEXT,
    "heroSecondaryCtaUrl" TEXT,
    "heroImageUrl" TEXT,
    "heroVideoUrl" TEXT,
    "heroGradientFrom" TEXT NOT NULL DEFAULT '#ff6a00',
    "heroGradientTo" TEXT NOT NULL DEFAULT '#ff3c00',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "contactAddress" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalPresentationPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalPresentationSection" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "anchor" TEXT NOT NULL,
    "sectionType" TEXT NOT NULL DEFAULT 'feature',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "icon" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "bodyHtml" TEXT NOT NULL,
    "imageUrl" TEXT,
    "galleryUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoUrl" TEXT,
    "youtubeUrl" TEXT,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "accentColor" TEXT,
    "bgStyle" TEXT NOT NULL DEFAULT 'white',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalPresentationSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalPresentationFaq" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answerHtml" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalPresentationFaq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalPresentationAnalytics" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "visitorId" TEXT,
    "sessionId" TEXT,
    "payload" JSONB,
    "referrer" TEXT,
    "userAgent" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalPresentationAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalPresentationPage_locale_slug_key" ON "PortalPresentationPage"("locale", "slug");

-- CreateIndex
CREATE INDEX "PortalPresentationPage_isPublished_locale_idx" ON "PortalPresentationPage"("isPublished", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "PortalPresentationSection_pageId_anchor_key" ON "PortalPresentationSection"("pageId", "anchor");

-- CreateIndex
CREATE INDEX "PortalPresentationSection_pageId_sortOrder_idx" ON "PortalPresentationSection"("pageId", "sortOrder");

-- CreateIndex
CREATE INDEX "PortalPresentationFaq_pageId_sortOrder_idx" ON "PortalPresentationFaq"("pageId", "sortOrder");

-- CreateIndex
CREATE INDEX "PortalPresentationAnalytics_pageId_eventType_createdAt_idx" ON "PortalPresentationAnalytics"("pageId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "PortalPresentationAnalytics_createdAt_idx" ON "PortalPresentationAnalytics"("createdAt");

-- AddForeignKey
ALTER TABLE "PortalPresentationSection" ADD CONSTRAINT "PortalPresentationSection_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "PortalPresentationPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalPresentationFaq" ADD CONSTRAINT "PortalPresentationFaq_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "PortalPresentationPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalPresentationAnalytics" ADD CONSTRAINT "PortalPresentationAnalytics_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "PortalPresentationPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
