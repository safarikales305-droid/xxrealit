-- AI obchodník – časové okno odesílání a log
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "enforceSendWindow" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "allowAdminManualSendAnytime" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "allowTestEmailOutsideWindow" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "ignoreWindowOnManualSend" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "sendWindowDaysJson" JSONB NOT NULL DEFAULT '[1,2,3,4,5]';

CREATE TABLE IF NOT EXISTS "AiSalesSendLog" (
  "id" TEXT NOT NULL,
  "messageId" TEXT,
  "prospectId" TEXT,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "sentById" TEXT,
  "sentAt" TIMESTAMP(3),
  "scheduledAt" TIMESTAMP(3),
  "blockReason" TEXT,
  "blockCode" TEXT,
  "currentTimeLabel" TEXT,
  "allowedWindowLabel" TEXT,
  "nextSendAt" TIMESTAMP(3),
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiSalesSendLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiSalesSendLog_messageId_idx" ON "AiSalesSendLog"("messageId");
CREATE INDEX IF NOT EXISTS "AiSalesSendLog_createdAt_idx" ON "AiSalesSendLog"("createdAt");

ALTER TABLE "AiSalesSendLog" ADD CONSTRAINT "AiSalesSendLog_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "AiSalesMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiSalesSendLog" ADD CONSTRAINT "AiSalesSendLog_sentById_fkey"
  FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
