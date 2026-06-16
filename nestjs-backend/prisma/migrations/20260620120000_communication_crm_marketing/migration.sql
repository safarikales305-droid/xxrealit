-- Communication center: CRM contacts, marketing campaigns, activity logs, WhatsApp extensions

CREATE TYPE "MarketingCampaignChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'INTERNAL_MESSAGE');
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED');
CREATE TYPE "MarketingCampaignAudience" AS ENUM (
  'ALL_USERS',
  'AGENTS',
  'INVESTORS',
  'FINANCIAL_ADVISORS',
  'CONSTRUCTION_COMPANIES',
  'CRAFTSMEN',
  'BY_REGION',
  'BY_CITY'
);
CREATE TYPE "ActivityLogCategory" AS ENUM (
  'WHATSAPP',
  'EMAIL',
  'FACEBOOK_IMPORT',
  'BONUS',
  'CREDITS',
  'REGISTRATION',
  'INVITE',
  'MARKETING_CAMPAIGN'
);

ALTER TABLE "WhatsAppMessage" ADD COLUMN IF NOT EXISTS "sentByUserId" TEXT;
ALTER TABLE "WhatsAppMessage" ADD COLUMN IF NOT EXISTS "recipientName" TEXT;

CREATE INDEX IF NOT EXISTS "WhatsAppMessage_sentByUserId_createdAt_idx" ON "WhatsAppMessage"("sentByUserId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_sentByUserId_fkey"
    FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CrmContact" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "listingId" TEXT,
  "contactLeadId" TEXT,
  "notes" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "reminderAt" TIMESTAMP(3),
  "lastContactAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketingCampaign" (
  "id" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "channel" "MarketingCampaignChannel" NOT NULL,
  "audience" "MarketingCampaignAudience" NOT NULL,
  "audienceRegion" TEXT,
  "audienceCity" TEXT,
  "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "deliveredCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ActivityLog" (
  "id" TEXT NOT NULL,
  "category" "ActivityLogCategory" NOT NULL,
  "userId" TEXT,
  "targetUserId" TEXT,
  "listingId" TEXT,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CrmContact_ownerUserId_createdAt_idx" ON "CrmContact"("ownerUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "CrmContact_listingId_idx" ON "CrmContact"("listingId");
CREATE INDEX IF NOT EXISTS "CrmContact_ownerUserId_lastContactAt_idx" ON "CrmContact"("ownerUserId", "lastContactAt");

CREATE INDEX IF NOT EXISTS "MarketingCampaign_createdByUserId_createdAt_idx" ON "MarketingCampaign"("createdByUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "MarketingCampaign_status_scheduledAt_idx" ON "MarketingCampaign"("status", "scheduledAt");

CREATE INDEX IF NOT EXISTS "ActivityLog_category_createdAt_idx" ON "ActivityLog"("category", "createdAt");
CREATE INDEX IF NOT EXISTS "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ActivityLog_listingId_createdAt_idx" ON "ActivityLog"("listingId", "createdAt");

ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
