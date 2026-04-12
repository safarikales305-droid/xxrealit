-- CreateTable
CREATE TABLE "ShortsMusicTrack" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT NOT NULL,
    "cloudinaryPublicId" TEXT,
    "mimeType" TEXT NOT NULL,
    "durationSec" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "ShortsMusicTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShortsMusicTrack_isActive_idx" ON "ShortsMusicTrack"("isActive");

-- CreateIndex
CREATE INDEX "ShortsMusicTrack_createdAt_idx" ON "ShortsMusicTrack"("createdAt");

-- AddForeignKey
ALTER TABLE "ShortsMusicTrack" ADD CONSTRAINT "ShortsMusicTrack_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
