-- AlterTable WorkerRecruitmentTarget
ALTER TABLE "WorkerRecruitmentTarget" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "WorkerRecruitmentTarget" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkerRecruitmentTarget" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkerRecruitmentTarget" ADD COLUMN IF NOT EXISTS "workerNote" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkerRecruitmentTarget" ADD COLUMN IF NOT EXISTS "isCustom" BOOLEAN NOT NULL DEFAULT false;

UPDATE "WorkerRecruitmentTarget" SET "slug" = LOWER("targetType"::text) WHERE "slug" IS NULL;

ALTER TABLE "WorkerRecruitmentTarget" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "WorkerRecruitmentTarget_slug_key" ON "WorkerRecruitmentTarget"("slug");

ALTER TABLE "WorkerRecruitmentTarget" ALTER COLUMN "targetType" DROP NOT NULL;

-- AlterTable WorkerBulkMessage
ALTER TABLE "WorkerBulkMessage" ADD COLUMN IF NOT EXISTS "subject" TEXT NOT NULL DEFAULT '';

-- CreateTable WorkerRecruitmentAssignment
CREATE TABLE IF NOT EXISTS "WorkerRecruitmentAssignment" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "assignedByAdminId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerRecruitmentAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkerRecruitmentDelivery" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "sentByAdminId" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "emailsSent" INTEGER NOT NULL DEFAULT 0,
    "emailErrors" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerRecruitmentDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkerRecruitmentAssignment_targetId_workerId_key" ON "WorkerRecruitmentAssignment"("targetId", "workerId");
CREATE INDEX IF NOT EXISTS "WorkerRecruitmentAssignment_workerId_assignedAt_idx" ON "WorkerRecruitmentAssignment"("workerId", "assignedAt");
CREATE INDEX IF NOT EXISTS "WorkerRecruitmentDelivery_targetId_sentAt_idx" ON "WorkerRecruitmentDelivery"("targetId", "sentAt");

ALTER TABLE "WorkerRecruitmentAssignment" ADD CONSTRAINT "WorkerRecruitmentAssignment_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "WorkerRecruitmentTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerRecruitmentAssignment" ADD CONSTRAINT "WorkerRecruitmentAssignment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerRecruitmentAssignment" ADD CONSTRAINT "WorkerRecruitmentAssignment_assignedByAdminId_fkey" FOREIGN KEY ("assignedByAdminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerRecruitmentDelivery" ADD CONSTRAINT "WorkerRecruitmentDelivery_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "WorkerRecruitmentTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerRecruitmentDelivery" ADD CONSTRAINT "WorkerRecruitmentDelivery_sentByAdminId_fkey" FOREIGN KEY ("sentByAdminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
