-- Accommodation hero CMS (Marketing / Ubytování / Hero)

CREATE TABLE "AccommodationHeroSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "title" TEXT NOT NULL DEFAULT 'Najděte si místo pro odpočinek',
  "subtitle" TEXT NOT NULL DEFAULT 'Hotely, apartmány, wellness pobyty a ubytování po celé ČR.',
  "heroImageUrl" TEXT,
  "heroImageAlt" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccommodationHeroSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccommodationHeroCategory" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "imageAlt" TEXT,
  "href" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccommodationHeroCategory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccommodationHeroCategory_active_sortOrder_idx" ON "AccommodationHeroCategory"("active", "sortOrder");
