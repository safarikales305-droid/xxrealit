-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PORTAL_WORKER';

-- CreateEnum
CREATE TYPE "PortalWorkerStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "ClientPreregistrationStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED');
CREATE TYPE "WorkerCommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID');

-- AlterTable User
ALTER TABLE "User" ADD COLUMN "portalWorkerId" TEXT;
ALTER TABLE "User" ADD COLUMN "portalWorkerStatus" "PortalWorkerStatus";
ALTER TABLE "User" ADD COLUMN "portalWorkerApprovedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "portalWorkerRejectedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "portalWorkerSuspendedAt" TIMESTAMP(3);

-- One-time fix: clear unauthorized credit debt (no top-up reversal in ledger)
UPDATE "User" u
SET "creditDebt" = 0, "accountLimited" = false
WHERE ("creditDebt" > 0 OR "accountLimited" = true)
  AND NOT EXISTS (
    SELECT 1 FROM "CreditLedger" cl
    WHERE cl."userId" = u.id
      AND cl."purpose" IN ('TOP_UP_REVERSED', 'TOP_UP_EXPIRED')
  );

-- CreateTable ClientPreregistration
CREATE TABLE "ClientPreregistration" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "targetRole" "UserRole" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "note" TEXT,
    "status" "ClientPreregistrationStatus" NOT NULL DEFAULT 'PENDING',
    "completionToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "completedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPreregistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable WorkerCommissionSetting
CREATE TABLE "WorkerCommissionSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "defaultPercent" INTEGER NOT NULL DEFAULT 10,
    "minTopUpAmount" INTEGER NOT NULL DEFAULT 300,
    "validityDays" INTEGER NOT NULL DEFAULT 365,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerCommissionSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable WorkerCommissionRoleRate
CREATE TABLE "WorkerCommissionRoleRate" (
    "role" "UserRole" NOT NULL,
    "percent" INTEGER NOT NULL,

    CONSTRAINT "WorkerCommissionRoleRate_pkey" PRIMARY KEY ("role")
);

-- CreateTable WorkerCommission
CREATE TABLE "WorkerCommission" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "creditTopUpId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "percent" INTEGER NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "status" "WorkerCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "WorkerCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientPreregistration_completionToken_key" ON "ClientPreregistration"("completionToken");
CREATE UNIQUE INDEX "ClientPreregistration_completedUserId_key" ON "ClientPreregistration"("completedUserId");
CREATE INDEX "ClientPreregistration_workerId_createdAt_idx" ON "ClientPreregistration"("workerId", "createdAt");
CREATE INDEX "ClientPreregistration_email_idx" ON "ClientPreregistration"("email");
CREATE INDEX "ClientPreregistration_status_idx" ON "ClientPreregistration"("status");

CREATE UNIQUE INDEX "WorkerCommission_creditTopUpId_key" ON "WorkerCommission"("creditTopUpId");
CREATE INDEX "WorkerCommission_workerId_createdAt_idx" ON "WorkerCommission"("workerId", "createdAt");
CREATE INDEX "WorkerCommission_referredUserId_createdAt_idx" ON "WorkerCommission"("referredUserId", "createdAt");
CREATE INDEX "WorkerCommission_status_idx" ON "WorkerCommission"("status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_portalWorkerId_fkey" FOREIGN KEY ("portalWorkerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientPreregistration" ADD CONSTRAINT "ClientPreregistration_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientPreregistration" ADD CONSTRAINT "ClientPreregistration_completedUserId_fkey" FOREIGN KEY ("completedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkerCommission" ADD CONSTRAINT "WorkerCommission_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerCommission" ADD CONSTRAINT "WorkerCommission_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerCommission" ADD CONSTRAINT "WorkerCommission_creditTopUpId_fkey" FOREIGN KEY ("creditTopUpId") REFERENCES "CreditTopUpTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default commission settings
INSERT INTO "WorkerCommissionSetting" ("id", "defaultPercent", "minTopUpAmount", "validityDays", "updatedAt")
VALUES ('default', 10, 300, 365, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "WorkerCommissionRoleRate" ("role", "percent") VALUES
  ('AGENT', 10),
  ('AGENCY', 10),
  ('COMPANY', 15),
  ('INVESTOR', 8),
  ('FINANCIAL_ADVISOR', 10),
  ('DEVELOPER', 10)
ON CONFLICT ("role") DO NOTHING;
