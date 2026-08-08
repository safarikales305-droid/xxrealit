-- Accommodation module

CREATE TYPE "AccommodationType" AS ENUM (
  'HOTEL', 'APARTMENT', 'PENSION', 'CHALUPA', 'CHATA', 'WELLNESS', 'CAMP', 'LUXURY', 'OTHER'
);

CREATE TYPE "AccommodationSource" AS ENUM ('DEMO', 'XXREALIT', 'BOOKING', 'EXPEDIA', 'OTHER');

CREATE TYPE "AccommodationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED');

CREATE TYPE "AccommodationOwnershipType" AS ENUM ('EXTERNAL', 'XXREALIT', 'USER');

CREATE TYPE "AccommodationDistribution" AS ENUM ('XXREALIT', 'BOOKING', 'OTHER');

CREATE TYPE "AccommodationPriceUnit" AS ENUM ('PER_NIGHT', 'PER_STAY', 'PER_PERSON');

CREATE TYPE "AccommodationSyncJobStatus" AS ENUM (
  'PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'
);

CREATE TABLE "Accommodation" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "source" "AccommodationSource" NOT NULL DEFAULT 'DEMO',
  "externalId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'demo',
  "type" "AccommodationType" NOT NULL DEFAULT 'HOTEL',
  "name" TEXT NOT NULL,
  "shortDescription" TEXT,
  "description" TEXT,
  "country" TEXT NOT NULL DEFAULT 'CZ',
  "region" TEXT,
  "city" TEXT NOT NULL,
  "address" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "stars" INTEGER,
  "rating" DOUBLE PRECISION,
  "reviewCount" INTEGER NOT NULL DEFAULT 0,
  "priceFrom" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'CZK',
  "priceUnit" "AccommodationPriceUnit" NOT NULL DEFAULT 'PER_NIGHT',
  "checkInFrom" TEXT,
  "checkOutUntil" TEXT,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "status" "AccommodationStatus" NOT NULL DEFAULT 'PUBLISHED',
  "published" BOOLEAN NOT NULL DEFAULT true,
  "ownershipType" "AccommodationOwnershipType" NOT NULL DEFAULT 'EXTERNAL',
  "distribution" "AccommodationDistribution"[] DEFAULT ARRAY['XXREALIT']::"AccommodationDistribution"[],
  "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "rules" TEXT,
  "petsAllowed" BOOLEAN NOT NULL DEFAULT false,
  "parking" BOOLEAN NOT NULL DEFAULT false,
  "wifi" BOOLEAN NOT NULL DEFAULT true,
  "breakfast" BOOLEAN NOT NULL DEFAULT false,
  "wellness" BOOLEAN NOT NULL DEFAULT false,
  "pool" BOOLEAN NOT NULL DEFAULT false,
  "airConditioning" BOOLEAN NOT NULL DEFAULT false,
  "accessible" BOOLEAN NOT NULL DEFAULT false,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Accommodation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Accommodation_slug_key" ON "Accommodation"("slug");
CREATE INDEX "Accommodation_city_idx" ON "Accommodation"("city");
CREATE INDEX "Accommodation_type_idx" ON "Accommodation"("type");
CREATE INDEX "Accommodation_status_published_idx" ON "Accommodation"("status", "published");
CREATE INDEX "Accommodation_provider_externalId_idx" ON "Accommodation"("provider", "externalId");

CREATE TABLE "AccommodationPhoto" (
  "id" TEXT NOT NULL,
  "accommodationId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "alt" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isCover" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccommodationPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccommodationPhoto_accommodationId_idx" ON "AccommodationPhoto"("accommodationId");

CREATE TABLE "AccommodationFacility" (
  "id" TEXT NOT NULL,
  "accommodationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "icon" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "AccommodationFacility_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccommodationFacility_accommodationId_idx" ON "AccommodationFacility"("accommodationId");

CREATE TABLE "AccommodationRoom" (
  "id" TEXT NOT NULL,
  "accommodationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "capacity" INTEGER NOT NULL DEFAULT 2,
  "beds" TEXT,
  "priceFrom" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'CZK',

  CONSTRAINT "AccommodationRoom_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccommodationRoom_accommodationId_idx" ON "AccommodationRoom"("accommodationId");

CREATE TABLE "AccommodationRate" (
  "id" TEXT NOT NULL,
  "accommodationId" TEXT NOT NULL,
  "roomId" TEXT,
  "dateFrom" TIMESTAMP(3),
  "dateTo" TIMESTAMP(3),
  "price" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CZK',
  "minNights" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "AccommodationRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccommodationRate_accommodationId_idx" ON "AccommodationRate"("accommodationId");

CREATE TABLE "AccommodationAvailability" (
  "id" TEXT NOT NULL,
  "accommodationId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "roomsLeft" INTEGER,

  CONSTRAINT "AccommodationAvailability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccommodationAvailability_accommodationId_date_key" ON "AccommodationAvailability"("accommodationId", "date");

CREATE TABLE "AccommodationProviderConfig" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "apiKey" TEXT,
  "affiliateId" TEXT,
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "lastSyncAt" TIMESTAMP(3),
  "importedCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "settingsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccommodationProviderConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccommodationProviderConfig_provider_key" ON "AccommodationProviderConfig"("provider");

CREATE TABLE "AccommodationSyncJob" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" "AccommodationSyncJobStatus" NOT NULL DEFAULT 'PENDING',
  "cursor" TEXT,
  "page" INTEGER NOT NULL DEFAULT 0,
  "processedCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "pauseReason" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccommodationSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccommodationSyncJob_status_idx" ON "AccommodationSyncJob"("status");

CREATE TABLE "AccommodationSyncLog" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'info',
  "message" TEXT NOT NULL,
  "externalId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccommodationSyncLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccommodationSyncLog_jobId_idx" ON "AccommodationSyncLog"("jobId");

CREATE TABLE "AccommodationLike" (
  "id" TEXT NOT NULL,
  "accommodationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccommodationLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccommodationLike_accommodationId_userId_key" ON "AccommodationLike"("accommodationId", "userId");
CREATE INDEX "AccommodationLike_userId_idx" ON "AccommodationLike"("userId");

ALTER TABLE "AccommodationPhoto" ADD CONSTRAINT "AccommodationPhoto_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccommodationFacility" ADD CONSTRAINT "AccommodationFacility_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccommodationRoom" ADD CONSTRAINT "AccommodationRoom_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccommodationRate" ADD CONSTRAINT "AccommodationRate_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccommodationRate" ADD CONSTRAINT "AccommodationRate_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "AccommodationRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccommodationAvailability" ADD CONSTRAINT "AccommodationAvailability_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccommodationSyncLog" ADD CONSTRAINT "AccommodationSyncLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AccommodationSyncJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccommodationLike" ADD CONSTRAINT "AccommodationLike_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccommodationLike" ADD CONSTRAINT "AccommodationLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "accommodationId" TEXT;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "accommodationId" TEXT;

CREATE INDEX IF NOT EXISTS "Post_accommodationId_idx" ON "Post"("accommodationId");
CREATE INDEX IF NOT EXISTS "Property_accommodationId_idx" ON "Property"("accommodationId");

DO $$ BEGIN
  ALTER TABLE "Post" ADD CONSTRAINT "Post_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Property" ADD CONSTRAINT "Property_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
