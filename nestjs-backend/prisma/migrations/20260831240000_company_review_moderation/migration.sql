-- Company review moderation workflow
ALTER TYPE "CompanyReviewStatus" ADD VALUE IF NOT EXISTS 'REMOVED';

ALTER TABLE "CompanyReview"
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedByAdminId" TEXT,
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectedByAdminId" TEXT,
  ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "hiddenByAdminId" TEXT,
  ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "removedByAdminId" TEXT,
  ADD COLUMN IF NOT EXISTS "removalReason" TEXT,
  ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "editedByAuthor" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "editedByAdminId" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewNeedsModeration" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lastApprovedRating" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastApprovedSentiment" "CompanyReviewSentiment",
  ADD COLUMN IF NOT EXISTS "lastApprovedTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "lastApprovedBody" TEXT,
  ADD COLUMN IF NOT EXISTS "lastApprovedMediaJson" JSONB;

CREATE TABLE IF NOT EXISTS "CompanyReviewRevision" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "sentiment" "CompanyReviewSentiment" NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "body" TEXT NOT NULL,
  "mediaSnapshot" JSONB,
  "statusAtRevision" "CompanyReviewStatus" NOT NULL,
  "createdByUserId" TEXT,
  "createdByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyReviewRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompanyReviewRevision_reviewId_createdAt_idx"
  ON "CompanyReviewRevision"("reviewId", "createdAt");

ALTER TABLE "CompanyReviewRevision"
  ADD CONSTRAINT "CompanyReviewRevision_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "CompanyReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyReviewMedia"
  ADD COLUMN IF NOT EXISTS "removedByAdminId" TEXT,
  ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "removalReason" TEXT;
