-- WhatsApp marketing center: user consent/opt-out, campaigns, send history

CREATE TYPE "WhatsAppMarketingCampaignType" AS ENUM (
  'NEW_LISTINGS',
  'BONUS_CREDITS',
  'INTERESTING_TIPS',
  'PORTAL_INVITE',
  'AGENT_AD',
  'INVESTOR_PROMO',
  'CUSTOM'
);

CREATE TYPE "WhatsAppMarketingCampaignStatus" AS ENUM (
  'DRAFT',
  'SENDING',
  'SENT',
  'FAILED',
  'CANCELLED'
);

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "whatsappMarketingOptOut" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "whatsappMarketingConsentAt" TIMESTAMP(3);

CREATE TABLE "WhatsAppMarketingCampaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "campaignType" "WhatsAppMarketingCampaignType" NOT NULL,
  "messageTemplate" TEXT NOT NULL,
  "targetRoles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[],
  "targetRegions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "targetCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "manualPhones" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "WhatsAppMarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" TEXT,
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),

  CONSTRAINT "WhatsAppMarketingCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppMarketingCampaignLog" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT,
  "recipientUserId" TEXT,
  "recipientName" TEXT,
  "recipientPhone" TEXT NOT NULL,
  "campaignType" "WhatsAppMarketingCampaignType",
  "message" TEXT NOT NULL,
  "status" "WhatsAppMessageStatus" NOT NULL,
  "errorMessage" TEXT,
  "isWelcome" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WhatsAppMarketingCampaignLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsAppMarketingCampaign_status_createdAt_idx"
  ON "WhatsAppMarketingCampaign"("status", "createdAt");
CREATE INDEX "WhatsAppMarketingCampaign_createdByUserId_idx"
  ON "WhatsAppMarketingCampaign"("createdByUserId");

CREATE INDEX "WhatsAppMarketingCampaignLog_campaignId_createdAt_idx"
  ON "WhatsAppMarketingCampaignLog"("campaignId", "createdAt");
CREATE INDEX "WhatsAppMarketingCampaignLog_recipientPhone_createdAt_idx"
  ON "WhatsAppMarketingCampaignLog"("recipientPhone", "createdAt");
CREATE INDEX "WhatsAppMarketingCampaignLog_createdAt_idx"
  ON "WhatsAppMarketingCampaignLog"("createdAt");

ALTER TABLE "WhatsAppMarketingCampaign"
  ADD CONSTRAINT "WhatsAppMarketingCampaign_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMarketingCampaignLog"
  ADD CONSTRAINT "WhatsAppMarketingCampaignLog_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "WhatsAppMarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMarketingCampaignLog"
  ADD CONSTRAINT "WhatsAppMarketingCampaignLog_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
