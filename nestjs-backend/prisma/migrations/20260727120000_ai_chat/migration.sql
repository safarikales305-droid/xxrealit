-- CreateEnum
CREATE TYPE "AiChatSessionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ESCALATED', 'SPAM');
CREATE TYPE "AiChatIntent" AS ENUM ('BUY_PROPERTY', 'RENT_PROPERTY', 'SELL_PROPERTY', 'RENT_OUT_PROPERTY', 'FIND_AGENT', 'AGENT_REGISTRATION', 'AGENCY_COOPERATION', 'CONSTRUCTION_COMPANY', 'FINANCIAL_ADVISOR', 'INVESTOR', 'PROPERTY_OWNER', 'SERVICE_PROVIDER', 'PORTAL_SUPPORT', 'GENERAL_QUESTION', 'UNKNOWN');
CREATE TYPE "AiChatConversationStage" AS ENUM ('DISCOVERY', 'ACTIVE_SEARCH', 'COMPARISON', 'READY_FOR_LEAD', 'CONTACT_COLLECTED', 'CLOSED');
CREATE TYPE "AiChatLeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'CONTACT_REQUESTED', 'ASSIGNED', 'CONTACTED', 'CONVERTED', 'LOST', 'SPAM');
CREATE TYPE "AiChatMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');
CREATE TYPE "AiKnowledgeStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');
CREATE TYPE "AiPromptStatus" AS ENUM ('DRAFT', 'TESTING', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "AiChatFeedbackRating" AS ENUM ('UP', 'DOWN');
CREATE TYPE "AiChatReviewStatus" AS ENUM ('PENDING', 'REVIEWED', 'DISMISSED');
CREATE TYPE "AiChatAdminReviewVerdict" AS ENUM ('CORRECT', 'PARTIAL', 'INCORRECT', 'IRRELEVANT', 'HALLUCINATION', 'BAD_TONE', 'TOO_LONG', 'MISSING_HUMAN_HANDOFF', 'GOOD_EXAMPLE');

-- CreateTable
CREATE TABLE "AiChatSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "globallyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "visibilityMode" TEXT NOT NULL DEFAULT 'PORTAL',
    "enabledPageTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disabledUrlPatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedUrlPatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "openDelaySeconds" INTEGER NOT NULL DEFAULT 0,
    "greetingDelaySeconds" INTEGER NOT NULL DEFAULT 0,
    "doNotReopenMinutes" INTEGER NOT NULL DEFAULT 60,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "maxMessagesPerMinute" INTEGER NOT NULL DEFAULT 8,
    "maxMessagesPerHour" INTEGER NOT NULL DEFAULT 40,
    "maxMessageLength" INTEGER NOT NULL DEFAULT 2000,
    "maxSessionMessages" INTEGER NOT NULL DEFAULT 80,
    "dailyChatRequestLimit" INTEGER NOT NULL DEFAULT 500,
    "dailyChatBudgetCzk" INTEGER NOT NULL DEFAULT 200,
    "monthlyChatBudgetCzk" INTEGER NOT NULL DEFAULT 2000,
    "maxOutputTokens" INTEGER NOT NULL DEFAULT 1500,
    "classificationModel" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
    "chatModel" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
    "maxPropertyRecommendations" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiChatSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiChatSession" (
    "id" TEXT NOT NULL,
    "publicSessionId" TEXT NOT NULL,
    "userId" TEXT,
    "status" "AiChatSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "isTestSession" BOOLEAN NOT NULL DEFAULT false,
    "sourcePageType" TEXT,
    "sourceUrl" TEXT,
    "sourceEntityId" TEXT,
    "sourceContextJson" JSONB,
    "detectedIntent" "AiChatIntent",
    "intentConfidence" DOUBLE PRECISION,
    "leadScore" INTEGER NOT NULL DEFAULT 0,
    "leadScoreBreakdown" JSONB,
    "conversationStage" "AiChatConversationStage" NOT NULL DEFAULT 'DISCOVERY',
    "assignedToUserId" TEXT,
    "adminNotes" TEXT,
    "qualityFlag" TEXT,
    "anonymizedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiChatSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "AiChatMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "safeContent" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "toolName" TEXT,
    "toolResultSummary" TEXT,
    "structuredPayload" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiChatProfile" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "offerType" TEXT,
    "propertyType" TEXT,
    "location" TEXT,
    "radiusKm" INTEGER,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "minArea" INTEGER,
    "layoutsJson" JSONB,
    "featuresJson" JSONB,
    "desiredMoveDate" TIMESTAMP(3),
    "companyType" TEXT,
    "cooperationInterest" TEXT,
    "structuredDataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiChatProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiChatLead" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "AiChatLeadStatus" NOT NULL DEFAULT 'NEW',
    "intent" "AiChatIntent",
    "summary" TEXT,
    "structuredParams" JSONB,
    "leadScore" INTEGER NOT NULL DEFAULT 0,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "consentStorage" BOOLEAN NOT NULL DEFAULT false,
    "consentTransfer" BOOLEAN NOT NULL DEFAULT false,
    "consentContact" BOOLEAN NOT NULL DEFAULT false,
    "sourceUrl" TEXT,
    "assignedToUserId" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiChatLead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiChatFeedback" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT,
    "rating" "AiChatFeedbackRating" NOT NULL,
    "category" TEXT,
    "comment" TEXT,
    "submittedByUserId" TEXT,
    "reviewedByAdminId" TEXT,
    "reviewStatus" "AiChatReviewStatus" NOT NULL DEFAULT 'PENDING',
    "adminVerdict" "AiChatAdminReviewVerdict",
    "correctAnswer" TEXT,
    "knowledgeDraftId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "AiChatFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiKnowledgeItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "keywordsJson" JSONB,
    "status" "AiKnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiKnowledgeItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiPromptVersion" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "status" "AiPromptStatus" NOT NULL DEFAULT 'DRAFT',
    "changeDescription" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiPromptVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiChatEvaluation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "evaluatorType" TEXT NOT NULL DEFAULT 'AUTO',
    "scoreIntentDetection" INTEGER,
    "scoreAnswerAccuracy" INTEGER,
    "scoreUsefulness" INTEGER,
    "scoreTone" INTEGER,
    "scoreConversion" INTEGER,
    "hallucinationDetected" BOOLEAN NOT NULL DEFAULT false,
    "unsafeAnswerDetected" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatEvaluation_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "AiChatSession_publicSessionId_key" ON "AiChatSession"("publicSessionId");
CREATE UNIQUE INDEX "AiChatProfile_sessionId_key" ON "AiChatProfile"("sessionId");
CREATE UNIQUE INDEX "AiPromptVersion_feature_version_key" ON "AiPromptVersion"("feature", "version");

CREATE INDEX "AiChatSession_userId_idx" ON "AiChatSession"("userId");
CREATE INDEX "AiChatSession_status_lastMessageAt_idx" ON "AiChatSession"("status", "lastMessageAt");
CREATE INDEX "AiChatSession_detectedIntent_idx" ON "AiChatSession"("detectedIntent");
CREATE INDEX "AiChatSession_leadScore_idx" ON "AiChatSession"("leadScore");
CREATE INDEX "AiChatSession_isTestSession_idx" ON "AiChatSession"("isTestSession");
CREATE INDEX "AiChatSession_createdAt_idx" ON "AiChatSession"("createdAt" DESC);

CREATE INDEX "AiChatMessage_sessionId_createdAt_idx" ON "AiChatMessage"("sessionId", "createdAt");
CREATE INDEX "AiChatMessage_role_idx" ON "AiChatMessage"("role");

CREATE INDEX "AiChatLead_sessionId_idx" ON "AiChatLead"("sessionId");
CREATE INDEX "AiChatLead_status_createdAt_idx" ON "AiChatLead"("status", "createdAt");
CREATE INDEX "AiChatLead_leadScore_idx" ON "AiChatLead"("leadScore");

CREATE INDEX "AiChatFeedback_sessionId_idx" ON "AiChatFeedback"("sessionId");
CREATE INDEX "AiChatFeedback_messageId_idx" ON "AiChatFeedback"("messageId");
CREATE INDEX "AiChatFeedback_reviewStatus_idx" ON "AiChatFeedback"("reviewStatus");
CREATE INDEX "AiChatFeedback_rating_idx" ON "AiChatFeedback"("rating");

CREATE INDEX "AiKnowledgeItem_status_category_idx" ON "AiKnowledgeItem"("status", "category");
CREATE INDEX "AiKnowledgeItem_updatedAt_idx" ON "AiKnowledgeItem"("updatedAt" DESC);

CREATE INDEX "AiPromptVersion_feature_status_idx" ON "AiPromptVersion"("feature", "status");

CREATE INDEX "AiChatEvaluation_sessionId_idx" ON "AiChatEvaluation"("sessionId");
CREATE INDEX "AiChatEvaluation_createdAt_idx" ON "AiChatEvaluation"("createdAt" DESC);

-- ForeignKeys
ALTER TABLE "AiChatSession" ADD CONSTRAINT "AiChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiChatSession" ADD CONSTRAINT "AiChatSession_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiChatProfile" ADD CONSTRAINT "AiChatProfile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiChatLead" ADD CONSTRAINT "AiChatLead_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiChatLead" ADD CONSTRAINT "AiChatLead_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiChatFeedback" ADD CONSTRAINT "AiChatFeedback_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiChatFeedback" ADD CONSTRAINT "AiChatFeedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AiChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiChatFeedback" ADD CONSTRAINT "AiChatFeedback_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiChatFeedback" ADD CONSTRAINT "AiChatFeedback_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiKnowledgeItem" ADD CONSTRAINT "AiKnowledgeItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiKnowledgeItem" ADD CONSTRAINT "AiKnowledgeItem_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiPromptVersion" ADD CONSTRAINT "AiPromptVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiPromptVersion" ADD CONSTRAINT "AiPromptVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiChatEvaluation" ADD CONSTRAINT "AiChatEvaluation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
