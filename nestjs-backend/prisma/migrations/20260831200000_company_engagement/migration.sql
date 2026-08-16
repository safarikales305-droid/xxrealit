-- Company engagement: campaigns, events, leads, email queue

CREATE TYPE "CompanyContactDiscoveryEntryState" AS ENUM (
  'NOT_SEARCHED',
  'SEARCHING',
  'FOUND',
  'REVIEW_REQUIRED',
  'VERIFIED',
  'NOT_FOUND'
);

CREATE TYPE "CompanyEngagementEventType" AS ENUM (
  'PROFILE_VIEW',
  'PROFILE_CLICK',
  'PHONE_CLICK',
  'EMAIL_CLICK',
  'WEBSITE_CLICK',
  'REVIEW_VIEW',
  'REVIEW_CREATED',
  'POST_VIEW',
  'CLAIM_STARTED',
  'CLAIM_COMPLETED',
  'POST_CREATED',
  'CONTACT_REQUEST'
);

CREATE TYPE "CompanyCampaignStatus" AS ENUM (
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'STOPPED',
  'OPTED_OUT',
  'BOUNCED'
);

CREATE TYPE "CompanyCampaignType" AS ENUM (
  'ACTIVATION_SEQUENCE',
  'MONTHLY_NURTURE',
  'INTEREST_NOTIFICATION'
);

CREATE TYPE "CompanyLeadStatus" AS ENUM (
  'NEW',
  'CONTACTED',
  'CLOSED',
  'SPAM',
  'REJECTED'
);

CREATE TYPE "CompanyEmailQueueStatus" AS ENUM (
  'QUEUED',
  'PROCESSING',
  'SENT',
  'FAILED',
  'CANCELLED'
);

ALTER TYPE "CompanyEmailLogStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "CompanyEmailLogStatus" ADD VALUE IF NOT EXISTS 'BOUNCED';
ALTER TYPE "CompanyEmailLogStatus" ADD VALUE IF NOT EXISTS 'OPENED';
ALTER TYPE "CompanyEmailLogStatus" ADD VALUE IF NOT EXISTS 'CLICKED';

ALTER TYPE "CompanyAuditAction" ADD VALUE IF NOT EXISTS 'ENGAGEMENT_EVENT';
ALTER TYPE "CompanyAuditAction" ADD VALUE IF NOT EXISTS 'CAMPAIGN_EMAIL';
ALTER TYPE "CompanyAuditAction" ADD VALUE IF NOT EXISTS 'LEAD_CREATED';
ALTER TYPE "CompanyAuditAction" ADD VALUE IF NOT EXISTS 'LEAD_NOTIFY';

ALTER TABLE "CompanyDirectoryEntry"
  ADD COLUMN IF NOT EXISTS "coverImageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "contactDiscoveryState" "CompanyContactDiscoveryEntryState" NOT NULL DEFAULT 'NOT_SEARCHED',
  ADD COLUMN IF NOT EXISTS "communicationOptOut" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "communicationOptOutAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "firstPostCreatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailBounced" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lastEngagementEmailAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "engagementOptOutToken" TEXT,
  ADD COLUMN IF NOT EXISTS "profileCompletenessScore" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyDirectoryEntry_engagementOptOutToken_key"
  ON "CompanyDirectoryEntry"("engagementOptOutToken");

CREATE INDEX IF NOT EXISTS "CompanyDirectoryEntry_communicationOptOut_idx"
  ON "CompanyDirectoryEntry"("communicationOptOut");

CREATE INDEX IF NOT EXISTS "CompanyDirectoryEntry_contactDiscoveryState_idx"
  ON "CompanyDirectoryEntry"("contactDiscoveryState");

ALTER TABLE "CompanyContact"
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "website" TEXT;

ALTER TABLE "CompanyEmailLog"
  ADD COLUMN IF NOT EXISTS "campaignId" TEXT,
  ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "clickedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "CompanyEngagementEvent" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT,
  "sessionId" TEXT,
  "type" "CompanyEngagementEventType" NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyEngagementEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyEngagementCampaign" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "campaignType" "CompanyCampaignType" NOT NULL DEFAULT 'ACTIVATION_SEQUENCE',
  "status" "CompanyCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "sequenceStep" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "nextSendAt" TIMESTAMP(3),
  "lastSentAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "stoppedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyEngagementCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyLead" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "message" TEXT,
  "consent" BOOLEAN NOT NULL DEFAULT false,
  "status" "CompanyLeadStatus" NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyLead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyEmailQueueItem" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "campaignId" TEXT,
  "template" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "variables" JSONB,
  "status" "CompanyEmailQueueStatus" NOT NULL DEFAULT 'QUEUED',
  "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyEmailQueueItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompanyEngagementEvent_companyId_type_createdAt_idx"
  ON "CompanyEngagementEvent"("companyId", "type", "createdAt");

CREATE INDEX IF NOT EXISTS "CompanyEngagementEvent_createdAt_idx"
  ON "CompanyEngagementEvent"("createdAt");

CREATE INDEX IF NOT EXISTS "CompanyEngagementCampaign_companyId_status_idx"
  ON "CompanyEngagementCampaign"("companyId", "status");

CREATE INDEX IF NOT EXISTS "CompanyEngagementCampaign_status_nextSendAt_idx"
  ON "CompanyEngagementCampaign"("status", "nextSendAt");

CREATE INDEX IF NOT EXISTS "CompanyLead_companyId_createdAt_idx"
  ON "CompanyLead"("companyId", "createdAt");

CREATE INDEX IF NOT EXISTS "CompanyLead_status_idx"
  ON "CompanyLead"("status");

CREATE INDEX IF NOT EXISTS "CompanyEmailQueueItem_status_scheduledAt_idx"
  ON "CompanyEmailQueueItem"("status", "scheduledAt");

CREATE INDEX IF NOT EXISTS "CompanyEmailQueueItem_companyId_createdAt_idx"
  ON "CompanyEmailQueueItem"("companyId", "createdAt");

CREATE INDEX IF NOT EXISTS "CompanyEmailLog_campaignId_idx"
  ON "CompanyEmailLog"("campaignId");

ALTER TABLE "CompanyEngagementEvent"
  ADD CONSTRAINT "CompanyEngagementEvent_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyEngagementEvent"
  ADD CONSTRAINT "CompanyEngagementEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CompanyEngagementCampaign"
  ADD CONSTRAINT "CompanyEngagementCampaign_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyLead"
  ADD CONSTRAINT "CompanyLead_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyLead"
  ADD CONSTRAINT "CompanyLead_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CompanyEmailQueueItem"
  ADD CONSTRAINT "CompanyEmailQueueItem_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyEmailLog"
  ADD CONSTRAINT "CompanyEmailLog_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "CompanyEngagementCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
