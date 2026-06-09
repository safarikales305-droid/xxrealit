-- AlterTable
ALTER TABLE "Property" ADD COLUMN "isContactPaid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Property" ADD COLUMN "contactUnlockPrice" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ListingContactUnlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingContactUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactLead" (
    "id" TEXT NOT NULL,
    "listingId" TEXT,
    "tipId" TEXT,
    "interestedUserId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "unlockPrice" INTEGER NOT NULL DEFAULT 0,
    "creditCharged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ListingContactUnlock_userId_propertyId_key" ON "ListingContactUnlock"("userId", "propertyId");
CREATE INDEX "ListingContactUnlock_propertyId_idx" ON "ListingContactUnlock"("propertyId");
CREATE INDEX "ContactLead_listingId_idx" ON "ContactLead"("listingId");
CREATE INDEX "ContactLead_tipId_idx" ON "ContactLead"("tipId");
CREATE INDEX "ContactLead_ownerUserId_createdAt_idx" ON "ContactLead"("ownerUserId", "createdAt");
CREATE INDEX "ContactLead_interestedUserId_createdAt_idx" ON "ContactLead"("interestedUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "ListingContactUnlock" ADD CONSTRAINT "ListingContactUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingContactUnlock" ADD CONSTRAINT "ListingContactUnlock_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactLead" ADD CONSTRAINT "ContactLead_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactLead" ADD CONSTRAINT "ContactLead_tipId_fkey" FOREIGN KEY ("tipId") REFERENCES "TiparPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactLead" ADD CONSTRAINT "ContactLead_interestedUserId_fkey" FOREIGN KEY ("interestedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactLead" ADD CONSTRAINT "ContactLead_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
