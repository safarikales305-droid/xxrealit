-- AlterTable
ALTER TABLE "DeveloperNote" ADD COLUMN "updatedById" TEXT;

-- CreateIndex
CREATE INDEX "DeveloperNote_updatedById_idx" ON "DeveloperNote"("updatedById");

-- AddForeignKey
ALTER TABLE "DeveloperNote" ADD CONSTRAINT "DeveloperNote_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
