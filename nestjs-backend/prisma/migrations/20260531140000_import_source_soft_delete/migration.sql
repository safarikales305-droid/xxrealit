-- AlterTable
ALTER TABLE "ImportSource" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ImportSource" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ImportSource_deletedAt_idx" ON "ImportSource"("deletedAt");
