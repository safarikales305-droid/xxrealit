-- AI Obchodník — akvizice partnerů

CREATE TYPE "AiSalesPartnerType" AS ENUM (
  'REAL_ESTATE_AGENT', 'REAL_ESTATE_AGENCY', 'CONSTRUCTION_COMPANY', 'DEVELOPER',
  'FINANCIAL_ADVISOR', 'MORTGAGE_SPECIALIST', 'INVESTOR', 'CRAFTSMAN',
  'PROPERTY_SERVICES', 'PROPERTY_MANAGER', 'PROPERTY_PHOTOGRAPHER',
  'LEGAL_TECH_SPECIALIST', 'OTHER'
);

CREATE TYPE "AiSalesProspectStatus" AS ENUM (
  'NEW', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'READY_FOR_OUTREACH',
  'CONTACTED', 'REPLIED', 'INTERESTED', 'FOLLOW_UP', 'CONVERTED',
  'NOT_INTERESTED', 'DO_NOT_CONTACT', 'INVALID', 'DUPLICATE'
);

CREATE TYPE "AiSalesVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'INVALID');
CREATE TYPE "AiSalesPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "AiSalesCampaignStatus" AS ENUM ('DRAFT', 'REVIEW', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "AiSalesMessageDirection" AS ENUM ('OUTBOUND', 'INBOUND');
CREATE TYPE "AiSalesMessageStatus" AS ENUM (
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'SENT', 'DELIVERED',
  'OPENED', 'REPLIED', 'BOUNCED', 'FAILED', 'REJECTED', 'CANCELLED'
);
CREATE TYPE "AiSalesReplyClassification" AS ENUM (
  'INTERESTED', 'REQUEST_MORE_INFO', 'WANTS_CALL', 'WANTS_MEETING', 'NOT_NOW',
  'NOT_INTERESTED', 'UNSUBSCRIBE', 'WRONG_CONTACT', 'AUTO_REPLY', 'BOUNCE', 'UNKNOWN'
);
CREATE TYPE "AiSalesLeadStatus" AS ENUM (
  'NEW', 'QUALIFIED', 'CONTACT_REQUESTED', 'MEETING_PROPOSED', 'MEETING_SCHEDULED',
  'OFFER_SENT', 'NEGOTIATION', 'WON', 'LOST', 'ON_HOLD'
);
CREATE TYPE "AiSalesTaskStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "AiSalesSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "testModeEnabled" BOOLEAN NOT NULL DEFAULT true,
  "requireManualApproval" BOOLEAN NOT NULL DEFAULT true,
  "dailyFirstOutreachLimit" INTEGER NOT NULL DEFAULT 20,
  "dailyFollowUpLimit" INTEGER NOT NULL DEFAULT 10,
  "maxFollowUpsPerProspect" INTEGER NOT NULL DEFAULT 2,
  "maxFirstOutreachPerCompany" INTEGER NOT NULL DEFAULT 1,
  "sendWindowStartHour" INTEGER NOT NULL DEFAULT 9,
  "sendWindowEndHour" INTEGER NOT NULL DEFAULT 17,
  "sendOnWeekends" BOOLEAN NOT NULL DEFAULT false,
  "autoSequenceEnabled" BOOLEAN NOT NULL DEFAULT false,
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Prague',
  "senderEmail" TEXT,
  "senderName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSalesSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSalesProspect" (
  "id" TEXT NOT NULL,
  "partnerType" "AiSalesPartnerType" NOT NULL,
  "companyName" TEXT NOT NULL,
  "contactName" TEXT,
  "position" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "website" TEXT,
  "city" TEXT,
  "region" TEXT,
  "serviceArea" TEXT,
  "specialization" TEXT,
  "companySize" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "sourceUrl" TEXT,
  "sourceNote" TEXT,
  "publicInfo" TEXT,
  "verificationStatus" "AiSalesVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "fitScore" INTEGER,
  "priority" "AiSalesPriority",
  "fitReasonsJson" JSONB,
  "fitRisksJson" JSONB,
  "analysisJson" JSONB,
  "status" "AiSalesProspectStatus" NOT NULL DEFAULT 'NEW',
  "doNotContact" BOOLEAN NOT NULL DEFAULT false,
  "doNotContactReason" TEXT,
  "assignedToId" TEXT,
  "lastContactAt" TIMESTAMP(3),
  "nextActionAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSalesProspect_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSalesCampaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "partnerType" "AiSalesPartnerType",
  "description" TEXT,
  "region" TEXT,
  "productOffer" TEXT,
  "promptFeature" TEXT,
  "knowledgeCategory" TEXT,
  "emailTemplateKey" TEXT,
  "targetAction" TEXT,
  "dailyLimit" INTEGER NOT NULL DEFAULT 20,
  "followUpLimit" INTEGER NOT NULL DEFAULT 2,
  "followUpDays1" INTEGER NOT NULL DEFAULT 6,
  "followUpDays2" INTEGER NOT NULL DEFAULT 12,
  "status" "AiSalesCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT,
  "approvedById" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSalesCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSalesMessage" (
  "id" TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "campaignId" TEXT,
  "direction" "AiSalesMessageDirection" NOT NULL DEFAULT 'OUTBOUND',
  "messageType" TEXT NOT NULL DEFAULT 'FIRST_OUTREACH',
  "subject" TEXT,
  "content" TEXT NOT NULL,
  "htmlContent" TEXT,
  "status" "AiSalesMessageStatus" NOT NULL DEFAULT 'DRAFT',
  "outreachReason" TEXT,
  "recommendedOffer" TEXT,
  "knowledgeUsedJson" JSONB,
  "promptVersionId" TEXT,
  "promptFeature" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "scheduledAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "repliedAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "providerMessageId" TEXT,
  "emailLogId" TEXT,
  "isTest" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSalesMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSalesReplyAnalysis" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "classification" "AiSalesReplyClassification",
  "confidence" DOUBLE PRECISION,
  "summary" TEXT,
  "recommendedAction" TEXT,
  "proposedReply" TEXT,
  "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSalesReplyAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSalesLead" (
  "id" TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "campaignId" TEXT,
  "status" "AiSalesLeadStatus" NOT NULL DEFAULT 'NEW',
  "interestScore" INTEGER,
  "summary" TEXT,
  "nextAction" TEXT,
  "assignedToId" TEXT,
  "nextActionAt" TIMESTAMP(3),
  "convertedUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSalesLead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSalesFeedback" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "rating" INTEGER,
  "category" TEXT,
  "correctedContent" TEXT,
  "notes" TEXT,
  "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiSalesFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSalesSuppression" (
  "id" TEXT NOT NULL,
  "email" TEXT,
  "domain" TEXT,
  "reason" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiSalesSuppression_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSalesTask" (
  "id" TEXT NOT NULL,
  "prospectId" TEXT,
  "leadId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "AiSalesTaskStatus" NOT NULL DEFAULT 'PENDING',
  "assignedToId" TEXT,
  "dueAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSalesTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSalesMeeting" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3),
  "notes" TEXT,
  "assignedToId" TEXT,
  "confirmed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSalesMeeting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiSalesReplyAnalysis_messageId_key" ON "AiSalesReplyAnalysis"("messageId");
CREATE INDEX "AiSalesProspect_status_createdAt_idx" ON "AiSalesProspect"("status", "createdAt" DESC);
CREATE INDEX "AiSalesProspect_partnerType_idx" ON "AiSalesProspect"("partnerType");
CREATE INDEX "AiSalesProspect_email_idx" ON "AiSalesProspect"("email");
CREATE INDEX "AiSalesProspect_companyName_idx" ON "AiSalesProspect"("companyName");
CREATE INDEX "AiSalesProspect_doNotContact_idx" ON "AiSalesProspect"("doNotContact");
CREATE INDEX "AiSalesProspect_fitScore_idx" ON "AiSalesProspect"("fitScore" DESC);
CREATE INDEX "AiSalesCampaign_status_idx" ON "AiSalesCampaign"("status");
CREATE INDEX "AiSalesCampaign_partnerType_idx" ON "AiSalesCampaign"("partnerType");
CREATE INDEX "AiSalesMessage_prospectId_createdAt_idx" ON "AiSalesMessage"("prospectId", "createdAt" DESC);
CREATE INDEX "AiSalesMessage_status_idx" ON "AiSalesMessage"("status");
CREATE INDEX "AiSalesMessage_campaignId_idx" ON "AiSalesMessage"("campaignId");
CREATE INDEX "AiSalesMessage_scheduledAt_idx" ON "AiSalesMessage"("scheduledAt");
CREATE INDEX "AiSalesReplyAnalysis_classification_idx" ON "AiSalesReplyAnalysis"("classification");
CREATE INDEX "AiSalesLead_status_idx" ON "AiSalesLead"("status");
CREATE INDEX "AiSalesLead_prospectId_idx" ON "AiSalesLead"("prospectId");
CREATE INDEX "AiSalesFeedback_messageId_idx" ON "AiSalesFeedback"("messageId");
CREATE INDEX "AiSalesSuppression_email_idx" ON "AiSalesSuppression"("email");
CREATE INDEX "AiSalesSuppression_domain_idx" ON "AiSalesSuppression"("domain");
CREATE INDEX "AiSalesTask_status_dueAt_idx" ON "AiSalesTask"("status", "dueAt");
CREATE INDEX "AiSalesTask_assignedToId_idx" ON "AiSalesTask"("assignedToId");
CREATE INDEX "AiSalesMeeting_leadId_idx" ON "AiSalesMeeting"("leadId");
CREATE INDEX "AiSalesMeeting_scheduledAt_idx" ON "AiSalesMeeting"("scheduledAt");

ALTER TABLE "AiSalesProspect" ADD CONSTRAINT "AiSalesProspect_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesProspect" ADD CONSTRAINT "AiSalesProspect_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesCampaign" ADD CONSTRAINT "AiSalesCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesCampaign" ADD CONSTRAINT "AiSalesCampaign_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesMessage" ADD CONSTRAINT "AiSalesMessage_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "AiSalesProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiSalesMessage" ADD CONSTRAINT "AiSalesMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AiSalesCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesMessage" ADD CONSTRAINT "AiSalesMessage_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesMessage" ADD CONSTRAINT "AiSalesMessage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesReplyAnalysis" ADD CONSTRAINT "AiSalesReplyAnalysis_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AiSalesMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiSalesReplyAnalysis" ADD CONSTRAINT "AiSalesReplyAnalysis_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesLead" ADD CONSTRAINT "AiSalesLead_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "AiSalesProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiSalesLead" ADD CONSTRAINT "AiSalesLead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AiSalesCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesLead" ADD CONSTRAINT "AiSalesLead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesLead" ADD CONSTRAINT "AiSalesLead_convertedUserId_fkey" FOREIGN KEY ("convertedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesFeedback" ADD CONSTRAINT "AiSalesFeedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AiSalesMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiSalesFeedback" ADD CONSTRAINT "AiSalesFeedback_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesTask" ADD CONSTRAINT "AiSalesTask_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "AiSalesProspect"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesTask" ADD CONSTRAINT "AiSalesTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesTask" ADD CONSTRAINT "AiSalesTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSalesMeeting" ADD CONSTRAINT "AiSalesMeeting_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "AiSalesLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiSalesMeeting" ADD CONSTRAINT "AiSalesMeeting_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "AiSalesSettings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
