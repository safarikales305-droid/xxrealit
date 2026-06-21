-- AlterTable WorkerCommissionSetting
ALTER TABLE "WorkerCommissionSetting" ADD COLUMN IF NOT EXISTS "defaultFixedAmount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable WorkerCommissionRoleRate
ALTER TABLE "WorkerCommissionRoleRate" ADD COLUMN IF NOT EXISTS "fixedAmount" INTEGER NOT NULL DEFAULT 0;
