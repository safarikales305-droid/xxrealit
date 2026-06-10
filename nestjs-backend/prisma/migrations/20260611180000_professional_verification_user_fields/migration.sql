-- CreateEnum
CREATE TYPE "ProfessionalVerificationStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "professionalVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "professionalVerificationStatus" "ProfessionalVerificationStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "publicProfessionalProfile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "professionalVerificationRequestedAt" TIMESTAMP(3),
ADD COLUMN     "professionalVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "professionalRejectedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_professionalVerificationStatus_professionalVerificationRequ_idx" ON "User"("professionalVerificationStatus", "professionalVerificationRequestedAt");

-- Backfill approved agents
UPDATE "User" u
SET
  "professionalVerified" = true,
  "professionalVerificationStatus" = 'APPROVED',
  "publicProfessionalProfile" = COALESCE(u."isPublicBrokerProfile", false),
  "professionalVerifiedAt" = COALESCE(u."professionalVerifiedAt", NOW())
FROM "AgentProfile" ap
WHERE u.id = ap."userId" AND ap."verificationStatus" = 'verified';

-- Backfill approved companies
UPDATE "User" u
SET
  "professionalVerified" = true,
  "professionalVerificationStatus" = 'APPROVED',
  "publicProfessionalProfile" = COALESCE(cp."isPublic", false),
  "professionalVerifiedAt" = COALESCE(u."professionalVerifiedAt", NOW())
FROM "CompanyProfile" cp
WHERE u.id = cp."userId" AND cp."verificationStatus" = 'verified';

-- Backfill approved agencies
UPDATE "User" u
SET
  "professionalVerified" = true,
  "professionalVerificationStatus" = 'APPROVED',
  "publicProfessionalProfile" = COALESCE(ap."isPublic", false),
  "professionalVerifiedAt" = COALESCE(u."professionalVerifiedAt", NOW())
FROM "AgencyProfile" ap
WHERE u.id = ap."userId" AND ap."verificationStatus" = 'verified';

-- Backfill approved financial advisors
UPDATE "User" u
SET
  "professionalVerified" = true,
  "professionalVerificationStatus" = 'APPROVED',
  "publicProfessionalProfile" = COALESCE(fap."isPublic", false),
  "professionalVerifiedAt" = COALESCE(u."professionalVerifiedAt", NOW())
FROM "FinancialAdvisorProfile" fap
WHERE u.id = fap."userId" AND fap."verificationStatus" = 'verified';

-- Backfill approved investors
UPDATE "User" u
SET
  "professionalVerified" = true,
  "professionalVerificationStatus" = 'APPROVED',
  "publicProfessionalProfile" = COALESCE(ip."isPublic", false),
  "professionalVerifiedAt" = COALESCE(u."professionalVerifiedAt", NOW())
FROM "InvestorProfile" ip
WHERE u.id = ip."userId" AND ip."verificationStatus" = 'verified';

-- Backfill pending requests from profile tables
UPDATE "User" u
SET
  "professionalVerificationStatus" = 'PENDING',
  "professionalVerificationRequestedAt" = COALESCE(u."professionalVerificationRequestedAt", ap."createdAt")
FROM "AgentProfile" ap
WHERE u.id = ap."userId" AND ap."verificationStatus" = 'pending'
  AND u."professionalVerificationStatus" = 'NONE';

UPDATE "User" u
SET
  "professionalVerificationStatus" = 'PENDING',
  "professionalVerificationRequestedAt" = COALESCE(u."professionalVerificationRequestedAt", cp."createdAt")
FROM "CompanyProfile" cp
WHERE u.id = cp."userId" AND cp."verificationStatus" = 'pending'
  AND u."professionalVerificationStatus" = 'NONE';

UPDATE "User" u
SET
  "professionalVerificationStatus" = 'PENDING',
  "professionalVerificationRequestedAt" = COALESCE(u."professionalVerificationRequestedAt", ap."createdAt")
FROM "AgencyProfile" ap
WHERE u.id = ap."userId" AND ap."verificationStatus" = 'pending'
  AND u."professionalVerificationStatus" = 'NONE';

UPDATE "User" u
SET
  "professionalVerificationStatus" = 'PENDING',
  "professionalVerificationRequestedAt" = COALESCE(u."professionalVerificationRequestedAt", fap."createdAt")
FROM "FinancialAdvisorProfile" fap
WHERE u.id = fap."userId" AND fap."verificationStatus" = 'pending'
  AND u."professionalVerificationStatus" = 'NONE';

UPDATE "User" u
SET
  "professionalVerificationStatus" = 'PENDING',
  "professionalVerificationRequestedAt" = COALESCE(u."professionalVerificationRequestedAt", ip."createdAt")
FROM "InvestorProfile" ip
WHERE u.id = ip."userId" AND ip."verificationStatus" = 'pending'
  AND u."professionalVerificationStatus" = 'NONE';

-- Backfill rejected
UPDATE "User" u
SET
  "professionalVerificationStatus" = 'REJECTED',
  "professionalRejectedAt" = COALESCE(u."professionalRejectedAt", NOW())
FROM "AgentProfile" ap
WHERE u.id = ap."userId" AND ap."verificationStatus" = 'rejected'
  AND u."professionalVerificationStatus" = 'NONE';
