-- AlterEnum
ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'ai_visualization_estimate_start';
ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'ai_visualization_estimate_complete';
ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'renovation_lead_email_entered';
ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'renovation_companies_viewed';
ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'renovation_request_created';
ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'renovation_request_sent';
ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'renovation_company_response';
ALTER TYPE "AiVisualizationEventName" ADD VALUE IF NOT EXISTS 'renovation_offer_received';

-- CreateEnum
CREATE TYPE "AiRenovationRequestStatus" AS ENUM ('NEW', 'SENT', 'COMPANIES_RESPONDING', 'OFFERS_RECEIVED', 'CLOSED');
CREATE TYPE "AiRenovationRecipientStatus" AS ENUM ('PENDING', 'NOTIFIED', 'INTERESTED', 'NO_CAPACITY', 'OFFER_SENT');
CREATE TYPE "AiRenovationMaterialTier" AS ENUM ('ECONOMY', 'STANDARD', 'PREMIUM');

-- CreateTable
CREATE TABLE "AiRenovationEstimate" (
    "id" TEXT NOT NULL,
    "visualizationId" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousSessionId" TEXT,
    "location" TEXT,
    "areaSqm" DOUBLE PRECISION,
    "scopePartial" BOOLEAN NOT NULL DEFAULT false,
    "materialTier" "AiRenovationMaterialTier" NOT NULL DEFAULT 'STANDARD',
    "lineItemsJson" JSONB NOT NULL,
    "estimateMin" INTEGER NOT NULL,
    "estimateMax" INTEGER NOT NULL,
    "reserveMin" INTEGER,
    "reserveMax" INTEGER,
    "totalMinWithReserve" INTEGER,
    "totalMaxWithReserve" INTEGER,
    "pricingVersion" TEXT NOT NULL,
    "region" TEXT,
    "source" TEXT NOT NULL DEFAULT 'AI_RENOVATION',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRenovationEstimate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiRenovationRequest" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "visualizationId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "description" TEXT,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "transferConsentAt" TIMESTAMP(3) NOT NULL,
    "transferConsentText" TEXT NOT NULL,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsentAt" TIMESTAMP(3),
    "status" "AiRenovationRequestStatus" NOT NULL DEFAULT 'NEW',
    "idempotencyKey" TEXT,
    "source" TEXT NOT NULL DEFAULT 'AI_RENOVATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRenovationRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiRenovationRequestRecipient" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "AiRenovationRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "offerPrice" INTEGER,
    "offerMessage" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRenovationRequestRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiRenovationEstimate_visualizationId_key" ON "AiRenovationEstimate"("visualizationId");
CREATE INDEX "AiRenovationEstimate_createdAt_idx" ON "AiRenovationEstimate"("createdAt");

CREATE UNIQUE INDEX "AiRenovationRequest_publicId_key" ON "AiRenovationRequest"("publicId");
CREATE UNIQUE INDEX "AiRenovationRequest_idempotencyKey_key" ON "AiRenovationRequest"("idempotencyKey");
CREATE INDEX "AiRenovationRequest_email_createdAt_idx" ON "AiRenovationRequest"("email", "createdAt");
CREATE INDEX "AiRenovationRequest_status_createdAt_idx" ON "AiRenovationRequest"("status", "createdAt");
CREATE INDEX "AiRenovationRequest_visualizationId_idx" ON "AiRenovationRequest"("visualizationId");

CREATE UNIQUE INDEX "AiRenovationRequestRecipient_requestId_companyId_key" ON "AiRenovationRequestRecipient"("requestId", "companyId");
CREATE INDEX "AiRenovationRequestRecipient_companyId_createdAt_idx" ON "AiRenovationRequestRecipient"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiRenovationEstimate" ADD CONSTRAINT "AiRenovationEstimate_visualizationId_fkey" FOREIGN KEY ("visualizationId") REFERENCES "AiVisualization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiRenovationRequest" ADD CONSTRAINT "AiRenovationRequest_visualizationId_fkey" FOREIGN KEY ("visualizationId") REFERENCES "AiVisualization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiRenovationRequest" ADD CONSTRAINT "AiRenovationRequest_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "AiRenovationEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiRenovationRequestRecipient" ADD CONSTRAINT "AiRenovationRequestRecipient_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AiRenovationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiRenovationRequestRecipient" ADD CONSTRAINT "AiRenovationRequestRecipient_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyDirectoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
