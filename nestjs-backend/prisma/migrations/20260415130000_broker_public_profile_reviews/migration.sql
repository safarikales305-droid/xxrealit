-- Veřejný profil makléře, volitelné recenze, model BrokerReview

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPublicBrokerProfile" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "allowBrokerReviews" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brokerProfileSlug" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brokerOfficeName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brokerSpecialization" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brokerRegionLabel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brokerWeb" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brokerPhonePublic" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brokerEmailPublic" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brokerReviewAverage" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brokerReviewCount" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "User_brokerProfileSlug_key" ON "User"("brokerProfileSlug");

CREATE TABLE IF NOT EXISTS "BrokerReview" (
    "id" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "reviewText" TEXT NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BrokerReview_brokerId_authorId_key" ON "BrokerReview"("brokerId", "authorId");

CREATE INDEX IF NOT EXISTS "BrokerReview_brokerId_isVisible_createdAt_idx" ON "BrokerReview"("brokerId", "isVisible", "createdAt");

ALTER TABLE "BrokerReview" DROP CONSTRAINT IF EXISTS "BrokerReview_brokerId_fkey";
ALTER TABLE "BrokerReview" ADD CONSTRAINT "BrokerReview_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrokerReview" DROP CONSTRAINT IF EXISTS "BrokerReview_authorId_fkey";
ALTER TABLE "BrokerReview" ADD CONSTRAINT "BrokerReview_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
