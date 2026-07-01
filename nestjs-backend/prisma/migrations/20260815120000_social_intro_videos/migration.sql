-- CreateEnum
CREATE TYPE "SocialIntroPropertyType" AS ENUM ('BYT', 'DUM', 'POZEMEK', 'KOMERCNI', 'GARAZ', 'NOVOSTAVBA', 'PRONAJEM', 'OSTATNI');

-- CreateTable
CREATE TABLE "SocialIntroVideo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "propertyType" "SocialIntroPropertyType" NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "durationSeconds" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialIntroVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialIntroVideo_propertyType_active_priority_idx" ON "SocialIntroVideo"("propertyType", "active", "priority");

-- AlterTable
ALTER TABLE "SocialPublishLog" ADD COLUMN IF NOT EXISTS "introVideoUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SocialPublishLog" ADD COLUMN IF NOT EXISTS "introVideoPropertyType" "SocialIntroPropertyType";
ALTER TABLE "SocialPublishLog" ADD COLUMN IF NOT EXISTS "introVideoDurationSec" DOUBLE PRECISION;
ALTER TABLE "SocialPublishLog" ADD COLUMN IF NOT EXISTS "totalReelDurationSec" DOUBLE PRECISION;
ALTER TABLE "SocialPublishLog" ADD COLUMN IF NOT EXISTS "introVideoError" TEXT;
