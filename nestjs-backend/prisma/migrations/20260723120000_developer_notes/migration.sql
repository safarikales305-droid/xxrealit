-- CreateTable
CREATE TABLE "DeveloperNote" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeveloperNote_createdAt_idx" ON "DeveloperNote"("createdAt");

-- CreateIndex
CREATE INDEX "DeveloperNote_category_idx" ON "DeveloperNote"("category");

-- CreateIndex
CREATE INDEX "DeveloperNote_status_idx" ON "DeveloperNote"("status");

-- AddForeignKey
ALTER TABLE "DeveloperNote" ADD CONSTRAINT "DeveloperNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
