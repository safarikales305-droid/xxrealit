-- Rozšíření e-mailových kampaní o sekvence, příjemce a logy.

ALTER TYPE "EmailCampaignStatus" ADD VALUE IF NOT EXISTS 'running';
ALTER TYPE "EmailCampaignStatus" ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE "EmailCampaignStatus" ADD VALUE IF NOT EXISTS 'completed';

DO $$ BEGIN
  CREATE TYPE "EmailCampaignRecipientStatus" AS ENUM (
    'pending', 'sent', 'opened', 'clicked', 'registered', 'unsubscribed', 'failed', 'skipped'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EmailCampaignRecipientSource" AS ENUM ('imported_broker', 'portal_user');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "EmailCampaign" ADD COLUMN IF NOT EXISTS "textContent" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmailCampaign" ADD COLUMN IF NOT EXISTS "senderName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmailCampaign" ADD COLUMN IF NOT EXISTS "minDaysBetweenSends" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "EmailCampaign" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "EmailCampaign" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "EmailCampaign" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "EmailCampaign" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "EmailCampaign" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "EmailCampaignStep" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "stepOrder" INTEGER NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "subject" TEXT NOT NULL,
  "htmlContent" TEXT NOT NULL,
  "textContent" TEXT NOT NULL DEFAULT '',
  "delayDays" INTEGER NOT NULL DEFAULT 0,
  "delayHours" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailCampaignStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailCampaignRecipient" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "fullName" TEXT NOT NULL DEFAULT '',
  "firstName" TEXT NOT NULL DEFAULT '',
  "company" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "role" TEXT NOT NULL DEFAULT '',
  "source" "EmailCampaignRecipientSource" NOT NULL,
  "sourceId" TEXT,
  "status" "EmailCampaignRecipientStatus" NOT NULL DEFAULT 'pending',
  "lastCompletedStepOrder" INTEGER NOT NULL DEFAULT -1,
  "nextStepAt" TIMESTAMP(3),
  "lastSentAt" TIMESTAMP(3),
  "registeredAt" TIMESTAMP(3),
  "unsubscribedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailCampaignRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailCampaignLog" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "stepId" TEXT,
  "stepOrder" INTEGER NOT NULL DEFAULT 0,
  "email" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" "EmailLogStatus" NOT NULL DEFAULT 'queued',
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailCampaignLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailMarketingUnsubscribe" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "unsubscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT NOT NULL DEFAULT 'campaign',
  CONSTRAINT "EmailMarketingUnsubscribe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailCampaignStep_campaignId_stepOrder_key"
  ON "EmailCampaignStep"("campaignId", "stepOrder");
CREATE INDEX IF NOT EXISTS "EmailCampaignStep_campaignId_idx" ON "EmailCampaignStep"("campaignId");

CREATE UNIQUE INDEX IF NOT EXISTS "EmailCampaignRecipient_campaignId_email_key"
  ON "EmailCampaignRecipient"("campaignId", "email");
CREATE INDEX IF NOT EXISTS "EmailCampaignRecipient_campaignId_status_idx"
  ON "EmailCampaignRecipient"("campaignId", "status");
CREATE INDEX IF NOT EXISTS "EmailCampaignRecipient_nextStepAt_idx" ON "EmailCampaignRecipient"("nextStepAt");
CREATE INDEX IF NOT EXISTS "EmailCampaignRecipient_email_idx" ON "EmailCampaignRecipient"("email");

CREATE INDEX IF NOT EXISTS "EmailCampaignLog_campaignId_createdAt_idx"
  ON "EmailCampaignLog"("campaignId", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailCampaignLog_recipientId_idx" ON "EmailCampaignLog"("recipientId");
CREATE INDEX IF NOT EXISTS "EmailCampaignLog_email_createdAt_idx" ON "EmailCampaignLog"("email", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "EmailMarketingUnsubscribe_email_key" ON "EmailMarketingUnsubscribe"("email");

DO $$ BEGIN
  ALTER TABLE "EmailCampaignStep" ADD CONSTRAINT "EmailCampaignStep_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "EmailCampaignRecipient" ADD CONSTRAINT "EmailCampaignRecipient_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "EmailCampaignLog" ADD CONSTRAINT "EmailCampaignLog_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "EmailCampaignLog" ADD CONSTRAINT "EmailCampaignLog_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "EmailCampaignRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "EmailCampaignLog" ADD CONSTRAINT "EmailCampaignLog_stepId_fkey"
    FOREIGN KEY ("stepId") REFERENCES "EmailCampaignStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
