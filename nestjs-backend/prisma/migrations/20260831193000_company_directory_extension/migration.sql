-- CreateEnum
CREATE TYPE "CompanyGoogleMatchStatus" AS ENUM ('NOT_SEARCHED', 'MATCHED_HIGH', 'MATCHED_MEDIUM', 'MATCHED_LOW', 'REVIEW_REQUIRED', 'NOT_FOUND');
CREATE TYPE "CompanyImportItemResult" AS ENUM ('CREATED', 'UPDATED', 'SKIPPED', 'FAILED');
CREATE TYPE "CompanyContactStatus" AS ENUM ('FOUND_HIGH_CONFIDENCE', 'FOUND_MEDIUM_CONFIDENCE', 'REVIEW_REQUIRED', 'NOT_FOUND', 'INVALID', 'VERIFIED', 'REJECTED');
CREATE TYPE "CompanyContactSourceType" AS ENUM ('OFFICIAL_WEBSITE', 'CONTACT_PAGE', 'USER_SUBMITTED', 'ADMIN_MANUAL', 'ARES');
CREATE TYPE "CompanyProviderJobStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED');
CREATE TYPE "CompanyReviewStatus" AS ENUM ('EMAIL_VERIFICATION_REQUIRED', 'PENDING', 'PUBLISHED', 'REJECTED', 'REPORTED', 'UNDER_REVIEW', 'HIDDEN');
CREATE TYPE "CompanyReviewSentiment" AS ENUM ('POSITIVE', 'NEGATIVE', 'NEUTRAL');
CREATE TYPE "CompanyReviewMediaType" AS ENUM ('IMAGE', 'VIDEO');
CREATE TYPE "CompanyEmailLogStatus" AS ENUM ('SENT', 'FAILED', 'QUEUED');
CREATE TYPE "CompanyAuditAction" AS ENUM ('ARES_IMPORT', 'GOOGLE_MATCH', 'GOOGLE_SYNC', 'CONTACT_DISCOVERY', 'ADMIN_EMAIL_SEND', 'REVIEW_CREATE', 'REVIEW_VERIFY', 'REVIEW_PUBLISH', 'COMPANY_RESPONSE', 'MODERATION', 'FACEBOOK_PUBLISH');

ALTER TYPE "CompanyContactDiscoveryStatus" ADD VALUE IF NOT EXISTS 'PAUSED';

-- AlterTable CompanyDirectoryEntry
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "googleMatchStatus" "CompanyGoogleMatchStatus" NOT NULL DEFAULT 'NOT_SEARCHED';
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "googleMatchScore" DOUBLE PRECISION;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "googleMapsUri" TEXT;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "googleReviewsCache" JSONB;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "googleReviewsCacheExpiresAt" TIMESTAMP(3);
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "verifiedBusinessEmail" TEXT;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "xxrealitRatingAverage" DOUBLE PRECISION;
ALTER TABLE "CompanyDirectoryEntry" ADD COLUMN IF NOT EXISTS "xxrealitReviewCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable CompanyImportJob
ALTER TABLE "CompanyImportJob" ADD COLUMN IF NOT EXISTS "requestsCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CompanyImportJob" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3);
ALTER TABLE "CompanyImportJob" ADD COLUMN IF NOT EXISTS "heartbeatAt" TIMESTAMP(3);

-- AlterTable Post
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "companyDirectoryId" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "companyReviewId" TEXT;

-- CreateTable CompanyImportItem
CREATE TABLE IF NOT EXISTS "CompanyImportItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "companyId" TEXT,
    "ico" TEXT NOT NULL,
    "name" TEXT,
    "city" TEXT,
    "category" "CompanyDirectoryCategory",
    "result" "CompanyImportItemResult" NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyImportItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceType" "CompanyContactSourceType" NOT NULL DEFAULT 'OFFICIAL_WEBSITE',
    "confidence" DOUBLE PRECISION,
    "status" "CompanyContactStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyGoogleEnrichmentJob" (
    "id" TEXT NOT NULL,
    "category" "CompanyDirectoryCategory",
    "region" TEXT,
    "city" TEXT,
    "status" "CompanyProviderJobStatus" NOT NULL DEFAULT 'PENDING',
    "processed" INTEGER NOT NULL DEFAULT 0,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "notFound" INTEGER NOT NULL DEFAULT 0,
    "needsReview" INTEGER NOT NULL DEFAULT 0,
    "totalExpected" INTEGER,
    "requestsCount" INTEGER NOT NULL DEFAULT 0,
    "batchSize" INTEGER,
    "delayMs" INTEGER,
    "lastCursor" INTEGER NOT NULL DEFAULT 0,
    "companyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyGoogleEnrichmentJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyGoogleEnrichmentItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "matchStatus" "CompanyGoogleMatchStatus" NOT NULL,
    "matchScore" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyGoogleEnrichmentItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyContactDiscoveryBatch" (
    "id" TEXT NOT NULL,
    "status" "CompanyProviderJobStatus" NOT NULL DEFAULT 'PENDING',
    "processed" INTEGER NOT NULL DEFAULT 0,
    "found" INTEGER NOT NULL DEFAULT 0,
    "notFound" INTEGER NOT NULL DEFAULT 0,
    "needsReview" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "totalExpected" INTEGER,
    "batchSize" INTEGER,
    "delayMs" INTEGER,
    "lastCursor" INTEGER NOT NULL DEFAULT 0,
    "companyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyContactDiscoveryBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyReview" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "sentiment" "CompanyReviewSentiment" NOT NULL DEFAULT 'NEUTRAL',
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "authorDisplayName" TEXT,
    "authorPhone" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken" TEXT,
    "emailVerificationExpires" TIMESTAMP(3),
    "submittedBusinessEmail" TEXT,
    "submittedEmailStatus" "CompanyContactStatus",
    "status" "CompanyReviewStatus" NOT NULL DEFAULT 'EMAIL_VERIFICATION_REQUIRED',
    "publishedAt" TIMESTAMP(3),
    "moderationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyReviewMedia" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "type" "CompanyReviewMediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyReviewMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyReviewResponse" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "verifiedCompanyResponse" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyReviewResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyReviewReport" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reporterUserId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "CompanyReviewStatus" NOT NULL DEFAULT 'REPORTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyReviewReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyEmailLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "bodyPreview" TEXT,
    "status" "CompanyEmailLogStatus" NOT NULL DEFAULT 'QUEUED',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "sentByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyEmailLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyAuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "action" "CompanyAuditAction" NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyAuditLog_pkey" PRIMARY KEY ("id")
);

-- Alter CompanyContactDiscoveryJob
ALTER TABLE "CompanyContactDiscoveryJob" ALTER COLUMN "companyId" DROP NOT NULL;
ALTER TABLE "CompanyContactDiscoveryJob" ADD COLUMN IF NOT EXISTS "batchId" TEXT;

-- Indexes and FKs
CREATE INDEX IF NOT EXISTS "CompanyImportItem_jobId_createdAt_idx" ON "CompanyImportItem"("jobId", "createdAt");
CREATE INDEX IF NOT EXISTS "CompanyContact_companyId_status_idx" ON "CompanyContact"("companyId", "status");
CREATE INDEX IF NOT EXISTS "CompanyReview_companyId_status_createdAt_idx" ON "CompanyReview"("companyId", "status", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyReviewResponse_reviewId_key" ON "CompanyReviewResponse"("reviewId");
CREATE UNIQUE INDEX IF NOT EXISTS "Post_companyReviewId_key" ON "Post"("companyReviewId");

ALTER TABLE "CompanyImportItem" ADD CONSTRAINT "CompanyImportItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CompanyImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyImportItem" ADD CONSTRAINT "CompanyImportItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyContact" ADD CONSTRAINT "CompanyContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyGoogleEnrichmentItem" ADD CONSTRAINT "CompanyGoogleEnrichmentItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CompanyGoogleEnrichmentJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyGoogleEnrichmentItem" ADD CONSTRAINT "CompanyGoogleEnrichmentItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyContactDiscoveryJob" ADD CONSTRAINT "CompanyContactDiscoveryJob_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CompanyContactDiscoveryBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyReview" ADD CONSTRAINT "CompanyReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyReview" ADD CONSTRAINT "CompanyReview_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyReviewMedia" ADD CONSTRAINT "CompanyReviewMedia_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "CompanyReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyReviewResponse" ADD CONSTRAINT "CompanyReviewResponse_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "CompanyReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyReviewResponse" ADD CONSTRAINT "CompanyReviewResponse_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyReviewReport" ADD CONSTRAINT "CompanyReviewReport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "CompanyReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyEmailLog" ADD CONSTRAINT "CompanyEmailLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_companyDirectoryId_fkey" FOREIGN KEY ("companyDirectoryId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_companyReviewId_fkey" FOREIGN KEY ("companyReviewId") REFERENCES "CompanyReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;
