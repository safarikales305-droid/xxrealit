-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "EmailLogStatus" AS ENUM ('queued', 'sent', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "EmailCampaignStatus" AS ENUM ('draft', 'scheduled', 'sent', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "EmailLog" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "templateKey" TEXT,
  "subject" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "senderEmail" TEXT,
  "senderName" TEXT,
  "status" "EmailLogStatus" NOT NULL DEFAULT 'queued',
  "provider" TEXT NOT NULL DEFAULT 'resend',
  "providerMessageId" TEXT,
  "errorMessage" TEXT,
  "payloadJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),

  CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EmailTemplate" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "htmlContent" TEXT NOT NULL,
  "textContent" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EmailCampaign" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "templateKey" TEXT,
  "htmlContent" TEXT NOT NULL,
  "status" "EmailCampaignStatus" NOT NULL DEFAULT 'draft',
  "audienceJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scheduledAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),

  CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "EmailTemplate_key_key" ON "EmailTemplate"("key");
CREATE INDEX IF NOT EXISTS "EmailLog_type_createdAt_idx" ON "EmailLog"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailLog_status_createdAt_idx" ON "EmailLog"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailLog_recipientEmail_createdAt_idx" ON "EmailLog"("recipientEmail", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailCampaign_status_createdAt_idx" ON "EmailCampaign"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailCampaign_type_createdAt_idx" ON "EmailCampaign"("type", "createdAt");
