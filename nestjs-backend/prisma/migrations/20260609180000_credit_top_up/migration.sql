-- CreateEnum
CREATE TYPE "CreditTopUpStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED', 'REVERSED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'CRAFTSMAN';
ALTER TYPE "UserRole" ADD VALUE 'TIPSTER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "creditDebt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "accountLimited" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CreditTopUpSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "accountNumber" TEXT NOT NULL DEFAULT '',
    "bankCode" TEXT NOT NULL DEFAULT '',
    "recipientName" TEXT NOT NULL DEFAULT 'XXRealit',
    "minAmount" INTEGER NOT NULL DEFAULT 300,
    "maxAmount" INTEGER NOT NULL DEFAULT 100000,
    "paymentMessage" TEXT NOT NULL DEFAULT 'Dobiti kreditu XXRealit',
    "confirmDeadlineDays" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditTopUpSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTopUpTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "variableSymbol" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "CreditTopUpStatus" NOT NULL DEFAULT 'PENDING',
    "qrPayload" TEXT NOT NULL,
    "creditedImmediately" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditTopUpTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditTopUpTransaction_userId_createdAt_idx" ON "CreditTopUpTransaction"("userId", "createdAt");
CREATE INDEX "CreditTopUpTransaction_status_expiresAt_idx" ON "CreditTopUpTransaction"("status", "expiresAt");
CREATE INDEX "CreditTopUpTransaction_variableSymbol_idx" ON "CreditTopUpTransaction"("variableSymbol");

-- AddForeignKey
ALTER TABLE "CreditTopUpTransaction" ADD CONSTRAINT "CreditTopUpTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default settings row
INSERT INTO "CreditTopUpSetting" ("id", "accountNumber", "bankCode", "recipientName", "minAmount", "maxAmount", "paymentMessage", "confirmDeadlineDays", "updatedAt")
VALUES ('default', '', '', 'XXRealit', 300, 100000, 'Dobiti kreditu XXRealit', 2, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
