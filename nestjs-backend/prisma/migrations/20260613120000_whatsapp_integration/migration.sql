-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappPhone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'WA_ME_CLICK', 'RECEIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "listingId" TEXT,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "fromPhone" TEXT NOT NULL DEFAULT '',
    "toPhone" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_userId_createdAt_idx" ON "WhatsAppMessage"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_listingId_createdAt_idx" ON "WhatsAppMessage"("listingId", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_status_createdAt_idx" ON "WhatsAppMessage"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_providerMessageId_idx" ON "WhatsAppMessage"("providerMessageId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
