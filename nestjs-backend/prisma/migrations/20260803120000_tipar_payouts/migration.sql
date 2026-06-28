-- CreateEnum
CREATE TYPE "TiparPayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID');

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tiparLifetimeEarnings" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tiparEarningsBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tiparPaidOutTotal" INTEGER NOT NULL DEFAULT 0;

-- Backfill tipster earnings from ledger
UPDATE "User" u
SET
  "tiparLifetimeEarnings" = COALESCE(sub.total, 0),
  "tiparEarningsBalance" = COALESCE(sub.total, 0)
FROM (
  SELECT "userId", SUM(amount)::INTEGER AS total
  FROM "CreditLedger"
  WHERE purpose = 'TIPSTER_EARNING'
  GROUP BY "userId"
) sub
WHERE u.id = sub."userId";

-- CreateTable
CREATE TABLE IF NOT EXISTS "TiparPayoutRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "TiparPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "bankAccountSnapshot" TEXT NOT NULL,
    "userEmailSnapshot" TEXT NOT NULL,
    "userPhoneSnapshot" TEXT,
    "userRoleSnapshot" TEXT NOT NULL,
    "adminNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAdminId" TEXT,

    CONSTRAINT "TiparPayoutRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TiparPayoutRequest_userId_requestedAt_idx" ON "TiparPayoutRequest"("userId", "requestedAt");
CREATE INDEX IF NOT EXISTS "TiparPayoutRequest_status_requestedAt_idx" ON "TiparPayoutRequest"("status", "requestedAt");

DO $$ BEGIN
  ALTER TABLE "TiparPayoutRequest" ADD CONSTRAINT "TiparPayoutRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TiparPayoutRequest" ADD CONSTRAINT "TiparPayoutRequest_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
