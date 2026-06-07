-- CreateEnum
CREATE TYPE "ShareGateTargetType" AS ENUM ('CLASSIC_LISTING', 'SHORTS_LISTING', 'TIP_LISTING', 'TIP_SHORTS', 'ALL');

-- CreateTable
CREATE TABLE "ShareGateVideo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "posterUrl" TEXT,
    "targetType" "ShareGateTargetType" NOT NULL DEFAULT 'ALL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "minWatchSeconds" INTEGER NOT NULL DEFAULT 5,
    "buttonText" TEXT NOT NULL DEFAULT 'Pokračovat na inzerát',
    "activeFrom" TIMESTAMP(3),
    "activeTo" TIMESTAMP(3),
    "cloudinaryVideoPublicId" TEXT,
    "cloudinaryPosterPublicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareGateVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShareGateVideo_targetType_isActive_sortOrder_idx" ON "ShareGateVideo"("targetType", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ShareGateVideo_isActive_sortOrder_idx" ON "ShareGateVideo"("isActive", "sortOrder");
