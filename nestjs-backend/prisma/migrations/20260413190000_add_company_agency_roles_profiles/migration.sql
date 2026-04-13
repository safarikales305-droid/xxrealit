-- Add enum roles
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COMPANY';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'AGENCY';

-- Company profile
CREATE TABLE IF NOT EXISTS "CompanyProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "contactFullName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "website" TEXT NOT NULL DEFAULT '',
  "ico" TEXT NOT NULL DEFAULT '',
  "city" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "services" TEXT NOT NULL,
  "logoUrl" TEXT,
  "verificationStatus" "AgentVerificationStatus" NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyProfile_userId_key" ON "CompanyProfile"("userId");
CREATE INDEX IF NOT EXISTS "CompanyProfile_verificationStatus_createdAt_idx" ON "CompanyProfile"("verificationStatus", "createdAt");

ALTER TABLE "CompanyProfile"
ADD CONSTRAINT "CompanyProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Agency profile
CREATE TABLE IF NOT EXISTS "AgencyProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "agencyName" TEXT NOT NULL,
  "contactFullName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "website" TEXT NOT NULL DEFAULT '',
  "ico" TEXT NOT NULL DEFAULT '',
  "city" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "logoUrl" TEXT,
  "agentCount" INTEGER,
  "branchCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "verificationStatus" "AgentVerificationStatus" NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgencyProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgencyProfile_userId_key" ON "AgencyProfile"("userId");
CREATE INDEX IF NOT EXISTS "AgencyProfile_verificationStatus_createdAt_idx" ON "AgencyProfile"("verificationStatus", "createdAt");

ALTER TABLE "AgencyProfile"
ADD CONSTRAINT "AgencyProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
