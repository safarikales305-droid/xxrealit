-- CreateTable
CREATE TABLE "VerificationFile" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "uploadedByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VerificationFile_filename_key" ON "VerificationFile"("filename");
CREATE INDEX "VerificationFile_filename_isActive_idx" ON "VerificationFile"("filename", "isActive");

-- AddForeignKey
ALTER TABLE "VerificationFile" ADD CONSTRAINT "VerificationFile_uploadedByAdminId_fkey" FOREIGN KEY ("uploadedByAdminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
