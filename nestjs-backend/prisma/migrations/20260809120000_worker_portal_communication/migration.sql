-- AlterEnum
ALTER TYPE "PortalWorkerStatus" ADD VALUE 'COOPERATION_CANCEL_REQUESTED';

-- CreateEnum
CREATE TYPE "WorkerInternalMessageSender" AS ENUM ('ADMIN', 'WORKER');
CREATE TYPE "WorkerCooperationCancelStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RESTORED');
CREATE TYPE "WorkerRecruitmentTargetType" AS ENUM (
  'AGENT',
  'REAL_ESTATE_AGENCY',
  'CONSTRUCTION_COMPANY',
  'INVESTOR',
  'FINANCIAL_ADVISOR',
  'CRAFTSMAN',
  'TIPSTER',
  'PRIVATE_SELLER',
  'DEVELOPER'
);

-- CreateTable
CREATE TABLE "WorkerInternalMessage" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "senderRole" "WorkerInternalMessageSender" NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "bulkMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerInternalMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkerBulkMessage" (
    "id" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "filterJson" JSONB,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "emailsSent" INTEGER NOT NULL DEFAULT 0,
    "emailErrors" INTEGER NOT NULL DEFAULT 0,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "templateName" TEXT,
    "createdById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerBulkMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkerBulkMessageRecipient" (
    "id" TEXT NOT NULL,
    "bulkMessageId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "internalMessageId" TEXT,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailError" TEXT,

    CONSTRAINT "WorkerBulkMessageRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkerProfileReminderSettings" (
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastReminderSentAt" TIMESTAMP(3),
    "remindersSentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerProfileReminderSettings_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "WorkerCooperationCancelRequest" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "WorkerCooperationCancelStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "WorkerCooperationCancelRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkerWorkGuide" (
    "id" TEXT NOT NULL,
    "workerId" TEXT,
    "templateName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerWorkGuide_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkerWorkGuideStep" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,

    CONSTRAINT "WorkerWorkGuideStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkerRecruitmentTarget" (
    "id" TEXT NOT NULL,
    "targetType" "WorkerRecruitmentTargetType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerRecruitmentTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkerRecruitmentScenario" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "stepsJson" JSONB NOT NULL,

    CONSTRAINT "WorkerRecruitmentScenario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkerInternalMessage_workerId_createdAt_idx" ON "WorkerInternalMessage"("workerId", "createdAt");
CREATE INDEX "WorkerInternalMessage_workerId_readAt_idx" ON "WorkerInternalMessage"("workerId", "readAt");
CREATE INDEX "WorkerBulkMessage_createdById_createdAt_idx" ON "WorkerBulkMessage"("createdById", "createdAt");
CREATE INDEX "WorkerBulkMessage_isTemplate_createdAt_idx" ON "WorkerBulkMessage"("isTemplate", "createdAt");
CREATE UNIQUE INDEX "WorkerBulkMessageRecipient_bulkMessageId_workerId_key" ON "WorkerBulkMessageRecipient"("bulkMessageId", "workerId");
CREATE INDEX "WorkerBulkMessageRecipient_workerId_idx" ON "WorkerBulkMessageRecipient"("workerId");
CREATE UNIQUE INDEX "WorkerCooperationCancelRequest_workerId_key" ON "WorkerCooperationCancelRequest"("workerId");
CREATE INDEX "WorkerCooperationCancelRequest_status_requestedAt_idx" ON "WorkerCooperationCancelRequest"("status", "requestedAt");
CREATE INDEX "WorkerWorkGuide_workerId_idx" ON "WorkerWorkGuide"("workerId");
CREATE INDEX "WorkerWorkGuide_isTemplate_idx" ON "WorkerWorkGuide"("isTemplate");
CREATE INDEX "WorkerWorkGuideStep_guideId_sortOrder_idx" ON "WorkerWorkGuideStep"("guideId", "sortOrder");
CREATE UNIQUE INDEX "WorkerRecruitmentTarget_targetType_key" ON "WorkerRecruitmentTarget"("targetType");
CREATE UNIQUE INDEX "WorkerRecruitmentScenario_targetId_key" ON "WorkerRecruitmentScenario"("targetId");

-- AddForeignKey
ALTER TABLE "WorkerInternalMessage" ADD CONSTRAINT "WorkerInternalMessage_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerInternalMessage" ADD CONSTRAINT "WorkerInternalMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerInternalMessage" ADD CONSTRAINT "WorkerInternalMessage_bulkMessageId_fkey" FOREIGN KEY ("bulkMessageId") REFERENCES "WorkerBulkMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkerBulkMessage" ADD CONSTRAINT "WorkerBulkMessage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerBulkMessageRecipient" ADD CONSTRAINT "WorkerBulkMessageRecipient_bulkMessageId_fkey" FOREIGN KEY ("bulkMessageId") REFERENCES "WorkerBulkMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerBulkMessageRecipient" ADD CONSTRAINT "WorkerBulkMessageRecipient_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerProfileReminderSettings" ADD CONSTRAINT "WorkerProfileReminderSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerCooperationCancelRequest" ADD CONSTRAINT "WorkerCooperationCancelRequest_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerCooperationCancelRequest" ADD CONSTRAINT "WorkerCooperationCancelRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkerWorkGuide" ADD CONSTRAINT "WorkerWorkGuide_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerWorkGuideStep" ADD CONSTRAINT "WorkerWorkGuideStep_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "WorkerWorkGuide"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerRecruitmentScenario" ADD CONSTRAINT "WorkerRecruitmentScenario_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "WorkerRecruitmentTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
