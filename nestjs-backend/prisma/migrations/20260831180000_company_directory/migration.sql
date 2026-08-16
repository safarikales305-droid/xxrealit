-- CreateEnum
CREATE TYPE "CompanyDirectoryCategory" AS ENUM ('STAVEBNICTVI', 'REALITY', 'FINANCE', 'PROJEKTOVANI', 'ARCHITEKTURA', 'SPRAVA_NEMOVITOSTI', 'REMESLA', 'DEVELOPMENT', 'ENERGETIKA', 'HYPOTEKA', 'OSTATNI');

-- CreateEnum
CREATE TYPE "CompanyDirectoryProfileStatus" AS ENUM ('UNCLAIMED', 'CLAIMED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "CompanyDirectoryVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED');

-- CreateEnum
CREATE TYPE "CompanyImportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CompanyImportJobSource" AS ENUM ('ARES');

-- CreateEnum
CREATE TYPE "CompanyClaimRequestStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CompanyProfileReportStatus" AS ENUM ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "CompanyGoogleMatchConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "CompanyContactDiscoveryStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "CompanyDirectoryEntry" (
    "id" TEXT NOT NULL,
    "ico" TEXT NOT NULL,
    "dic" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalForm" TEXT,
    "companyStatus" TEXT,
    "street" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "district" TEXT,
    "region" TEXT,
    "country" TEXT NOT NULL DEFAULT 'CZ',
    "registeredAddress" TEXT,
    "aresSource" BOOLEAN NOT NULL DEFAULT true,
    "aresLastSyncAt" TIMESTAMP(3),
    "aresRawUpdatedAt" TIMESTAMP(3),
    "categories" "CompanyDirectoryCategory"[] DEFAULT ARRAY[]::"CompanyDirectoryCategory"[],
    "businessActivities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publicProfile" BOOLEAN NOT NULL DEFAULT true,
    "profileStatus" "CompanyDirectoryProfileStatus" NOT NULL DEFAULT 'UNCLAIMED',
    "claimedAt" TIMESTAMP(3),
    "claimedByUserId" TEXT,
    "website" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "googlePlaceId" TEXT,
    "googleRating" DOUBLE PRECISION,
    "googleReviewCount" INTEGER,
    "googleLastSyncAt" TIMESTAMP(3),
    "googleMatchConfidence" "CompanyGoogleMatchConfidence",
    "verificationStatus" "CompanyDirectoryVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "aiSummary" TEXT,
    "aiPositiveSummary" JSONB,
    "aiNegativeSummary" JSONB,
    "aiNeutralTopics" JSONB,
    "sentimentScore" DOUBLE PRECISION,
    "reliabilityScore" DOUBLE PRECISION,
    "reliabilityFactors" JSONB,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDirectoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyImportJob" (
    "id" TEXT NOT NULL,
    "source" "CompanyImportJobSource" NOT NULL DEFAULT 'ARES',
    "category" "CompanyDirectoryCategory",
    "region" TEXT,
    "district" TEXT,
    "city" TEXT,
    "status" "CompanyImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "processed" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "lastCursor" INTEGER NOT NULL DEFAULT 0,
    "lastIco" TEXT,
    "totalExpected" INTEGER,
    "batchSize" INTEGER,
    "delayMs" INTEGER,
    "importMode" TEXT NOT NULL DEFAULT 'SEARCH',
    "icoList" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "searchFilter" JSONB,
    "checkpoint" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyClaimRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "ico" TEXT NOT NULL,
    "status" "CompanyClaimRequestStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyClaimRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProfileReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reporterUserId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "CompanyProfileReportStatus" NOT NULL DEFAULT 'REQUESTED',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfileReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyContactDiscoveryJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "website" TEXT,
    "candidateEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION,
    "status" "CompanyContactDiscoveryStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyContactDiscoveryJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyDirectoryEntry_ico_key" ON "CompanyDirectoryEntry"("ico");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyDirectoryEntry_slug_key" ON "CompanyDirectoryEntry"("slug");

-- CreateIndex
CREATE INDEX "CompanyDirectoryEntry_publicProfile_profileStatus_idx" ON "CompanyDirectoryEntry"("publicProfile", "profileStatus");

-- CreateIndex
CREATE INDEX "CompanyDirectoryEntry_region_city_idx" ON "CompanyDirectoryEntry"("region", "city");

-- CreateIndex
CREATE INDEX "CompanyDirectoryEntry_verificationStatus_idx" ON "CompanyDirectoryEntry"("verificationStatus");

-- CreateIndex
CREATE INDEX "CompanyImportJob_status_createdAt_idx" ON "CompanyImportJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CompanyClaimRequest_status_createdAt_idx" ON "CompanyClaimRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CompanyClaimRequest_companyId_idx" ON "CompanyClaimRequest"("companyId");

-- CreateIndex
CREATE INDEX "CompanyProfileReport_status_createdAt_idx" ON "CompanyProfileReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CompanyProfileReport_companyId_idx" ON "CompanyProfileReport"("companyId");

-- CreateIndex
CREATE INDEX "CompanyContactDiscoveryJob_status_createdAt_idx" ON "CompanyContactDiscoveryJob"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "CompanyDirectoryEntry" ADD CONSTRAINT "CompanyDirectoryEntry_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyClaimRequest" ADD CONSTRAINT "CompanyClaimRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyClaimRequest" ADD CONSTRAINT "CompanyClaimRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProfileReport" ADD CONSTRAINT "CompanyProfileReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyContactDiscoveryJob" ADD CONSTRAINT "CompanyContactDiscoveryJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
