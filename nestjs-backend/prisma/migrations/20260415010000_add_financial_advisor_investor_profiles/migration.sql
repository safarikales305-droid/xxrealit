-- Add enum roles
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'FINANCIAL_ADVISOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'INVESTOR';

-- Financial advisor profile
CREATE TABLE IF NOT EXISTS "FinancialAdvisorProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "brandName" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "website" TEXT NOT NULL DEFAULT '',
  "ico" TEXT NOT NULL DEFAULT '',
  "city" TEXT NOT NULL,
  "bio" TEXT NOT NULL,
  "specializations" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "avatarUrl" TEXT,
  "logoUrl" TEXT,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "verificationStatus" "AgentVerificationStatus" NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialAdvisorProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FinancialAdvisorProfile_userId_key" ON "FinancialAdvisorProfile"("userId");
CREATE INDEX IF NOT EXISTS "FinancialAdvisorProfile_verificationStatus_createdAt_idx" ON "FinancialAdvisorProfile"("verificationStatus", "createdAt");

ALTER TABLE "FinancialAdvisorProfile"
ADD CONSTRAINT "FinancialAdvisorProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Investor profile
CREATE TABLE IF NOT EXISTS "InvestorProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "investorName" TEXT NOT NULL DEFAULT '',
  "investorType" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "website" TEXT NOT NULL DEFAULT '',
  "city" TEXT NOT NULL,
  "bio" TEXT NOT NULL,
  "investmentFocus" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "avatarUrl" TEXT,
  "logoUrl" TEXT,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "verificationStatus" "AgentVerificationStatus" NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvestorProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InvestorProfile_userId_key" ON "InvestorProfile"("userId");
CREATE INDEX IF NOT EXISTS "InvestorProfile_verificationStatus_createdAt_idx" ON "InvestorProfile"("verificationStatus", "createdAt");

ALTER TABLE "InvestorProfile"
ADD CONSTRAINT "InvestorProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
