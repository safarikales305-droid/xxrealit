-- AlterEnum
ALTER TYPE "AiSalesContactType" ADD VALUE IF NOT EXISTS 'CONTACT_FORM';
ALTER TYPE "AiSalesContactType" ADD VALUE IF NOT EXISTS 'OTHER';

-- CreateEnum
CREATE TYPE "AiSalesMessageRecipientStatus" AS ENUM (
  'SELECTED',
  'APPROVED',
  'QUEUED',
  'SENT',
  'DELIVERED',
  'BOUNCED',
  'REPLIED',
  'UNSUBSCRIBED',
  'FAILED',
  'CANCELLED'
);

-- AlterTable
ALTER TABLE "AiSalesPublicContact"
  ADD COLUMN IF NOT EXISTS "contactPersonName" TEXT,
  ADD COLUMN IF NOT EXISTS "contactPersonRole" TEXT,
  ADD COLUMN IF NOT EXISTS "isSelectedForOutreach" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiSalesMessageRecipient" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "contactId" TEXT,
  "email" TEXT NOT NULL,
  "status" "AiSalesMessageRecipientStatus" NOT NULL DEFAULT 'SELECTED',
  "selected" BOOLEAN NOT NULL DEFAULT true,
  "approved" BOOLEAN NOT NULL DEFAULT false,
  "providerMessageId" TEXT,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "clickedAt" TIMESTAMP(3),
  "repliedAt" TIMESTAMP(3),
  "bouncedAt" TIMESTAMP(3),
  "unsubscribedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiSalesMessageRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiSalesPublicContact_isSelectedForOutreach_idx" ON "AiSalesPublicContact"("isSelectedForOutreach");
CREATE INDEX IF NOT EXISTS "AiSalesMessageRecipient_messageId_idx" ON "AiSalesMessageRecipient"("messageId");
CREATE INDEX IF NOT EXISTS "AiSalesMessageRecipient_contactId_idx" ON "AiSalesMessageRecipient"("contactId");
CREATE INDEX IF NOT EXISTS "AiSalesMessageRecipient_email_idx" ON "AiSalesMessageRecipient"("email");
CREATE INDEX IF NOT EXISTS "AiSalesMessageRecipient_status_idx" ON "AiSalesMessageRecipient"("status");

-- Dedupe before unique constraint (keep newest per prospect+type+normalized)
DELETE FROM "AiSalesPublicContact" a
USING "AiSalesPublicContact" b
WHERE a."prospectId" IS NOT NULL
  AND b."prospectId" IS NOT NULL
  AND a."prospectId" = b."prospectId"
  AND a."type" = b."type"
  AND a."normalizedValue" = b."normalizedValue"
  AND a."normalizedValue" IS NOT NULL
  AND a."createdAt" < b."createdAt";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AiSalesPublicContact_prospectId_type_normalizedValue_key"
  ON "AiSalesPublicContact"("prospectId", "type", "normalizedValue");

-- AddForeignKey
ALTER TABLE "AiSalesMessageRecipient"
  ADD CONSTRAINT "AiSalesMessageRecipient_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "AiSalesMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiSalesMessageRecipient"
  ADD CONSTRAINT "AiSalesMessageRecipient_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "AiSalesPublicContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
