-- AiSalesMessage outreach fields
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "preheader" TEXT;
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "greeting" TEXT;
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "intro" TEXT;
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "benefitsJson" JSONB;
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "ctaText" TEXT;
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "ctaUrl" TEXT;
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "closing" TEXT;
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "signature" TEXT;
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "plainText" TEXT;
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "personalizationReasonsJson" JSONB;
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "usedKnowledgeIdsJson" JSONB;
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION;
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "variantLabel" TEXT;
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "analysisIncomplete" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "AiSalesMessageVersion" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "contentJson" JSONB NOT NULL,
  "changeSource" TEXT NOT NULL DEFAULT 'AI',
  "changeDescription" TEXT,
  "createdById" TEXT,
  "promptVersionId" TEXT,
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiSalesMessageVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiSalesMessageVersion_messageId_version_key" ON "AiSalesMessageVersion"("messageId", "version");
CREATE INDEX IF NOT EXISTS "AiSalesMessageVersion_messageId_idx" ON "AiSalesMessageVersion"("messageId");

ALTER TABLE "AiSalesMessageVersion" DROP CONSTRAINT IF EXISTS "AiSalesMessageVersion_messageId_fkey";
ALTER TABLE "AiSalesMessageVersion" ADD CONSTRAINT "AiSalesMessageVersion_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "AiSalesMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
