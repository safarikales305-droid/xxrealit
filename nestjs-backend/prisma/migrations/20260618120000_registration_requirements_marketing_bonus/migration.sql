-- Marketing bonus action type
CREATE TYPE "MarketingBonusActionType" AS ENUM (
  'FACEBOOK_CONNECT',
  'INVITE_EMAIL',
  'INVITE_WHATSAPP',
  'REFERRAL_REGISTRATION',
  'FIRST_AD',
  'FIRST_VIDEO_AD',
  'FIRST_POST',
  'PROFILE_COMPLETE',
  'PROFILE_VERIFIED',
  'CUSTOM',
  'LEGACY_LISTING_TIP'
);

-- User referral + verification
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referredByUserId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX IF NOT EXISTS "User_referredByUserId_idx" ON "User"("referredByUserId");

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_referredByUserId_fkey"
    FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Bonus campaign extensions
ALTER TABLE "BonusCampaign" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "BonusCampaign" ADD COLUMN IF NOT EXISTS "actionType" "MarketingBonusActionType" NOT NULL DEFAULT 'LEGACY_LISTING_TIP';
ALTER TABLE "BonusCampaign" ADD COLUMN IF NOT EXISTS "roles" "UserRole"[] NOT NULL DEFAULT ARRAY[]::"UserRole"[];
ALTER TABLE "BonusCampaign" ADD COLUMN IF NOT EXISTS "maxTotalClaims" INTEGER;
ALTER TABLE "BonusCampaign" ADD COLUMN IF NOT EXISTS "maxClaimsPerUser" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "BonusCampaign" ADD COLUMN IF NOT EXISTS "conditionMinCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "BonusCampaign" ADD COLUMN IF NOT EXISTS "customConditionText" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "BonusCampaign_actionType_isActive_idx" ON "BonusCampaign"("actionType", "isActive");

-- Bonus claim extensions
ALTER TABLE "BonusClaim" ADD COLUMN IF NOT EXISTS "reason" TEXT;
ALTER TABLE "BonusClaim" ALTER COLUMN "sourceType" DROP NOT NULL;
ALTER TABLE "BonusClaim" ALTER COLUMN "sourceId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "BonusClaim_reason_idx" ON "BonusClaim"("reason");

-- Registration requirements per role
CREATE TABLE IF NOT EXISTS "RegistrationRequirementSetting" (
  "role" "UserRole" NOT NULL,
  "requireFirstListing" BOOLEAN NOT NULL DEFAULT false,
  "requireFirstPost" BOOLEAN NOT NULL DEFAULT false,
  "requireFacebookPage" BOOLEAN NOT NULL DEFAULT false,
  "requireProfileComplete" BOOLEAN NOT NULL DEFAULT false,
  "requirePhoneVerified" BOOLEAN NOT NULL DEFAULT false,
  "requireEmailVerified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistrationRequirementSetting_pkey" PRIMARY KEY ("role")
);

INSERT INTO "RegistrationRequirementSetting" ("role", "updatedAt")
VALUES
  ('USER', CURRENT_TIMESTAMP),
  ('AGENT', CURRENT_TIMESTAMP),
  ('AGENCY', CURRENT_TIMESTAMP),
  ('COMPANY', CURRENT_TIMESTAMP),
  ('CRAFTSMAN', CURRENT_TIMESTAMP),
  ('FINANCIAL_ADVISOR', CURRENT_TIMESTAMP),
  ('INVESTOR', CURRENT_TIMESTAMP)
ON CONFLICT ("role") DO NOTHING;

-- Referral invites
CREATE TABLE IF NOT EXISTS "ReferralInvite" (
  "id" TEXT NOT NULL,
  "inviterUserId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "target" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralInvite_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReferralInvite_inviterUserId_channel_createdAt_idx"
  ON "ReferralInvite"("inviterUserId", "channel", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ReferralInvite" ADD CONSTRAINT "ReferralInvite_inviterUserId_fkey"
    FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
