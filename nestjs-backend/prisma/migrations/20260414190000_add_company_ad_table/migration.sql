-- CreateTable
CREATE TABLE IF NOT EXISTS "CompanyAd" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "ctaText" TEXT NOT NULL,
  "targetUrl" TEXT NOT NULL,
  "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompanyAd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompanyAd_companyId_isActive_idx" ON "CompanyAd"("companyId", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompanyAd_isActive_updatedAt_idx" ON "CompanyAd"("isActive", "updatedAt");

-- AddForeignKey
ALTER TABLE "CompanyAd"
ADD CONSTRAINT "CompanyAd_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
