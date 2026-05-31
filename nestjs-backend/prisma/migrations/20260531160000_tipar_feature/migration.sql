-- AlterTable
ALTER TABLE "User" ADD COLUMN "isTipar" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN "isTiparTip" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TiparPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoUrl" TEXT,
    "city" TEXT NOT NULL DEFAULT '',
    "propertyPrice" INTEGER,
    "sourceUrl" TEXT,
    "ownerNote" TEXT,
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactUnlockPrice" INTEGER NOT NULL DEFAULT 100,
    "isShorts" BOOLEAN NOT NULL DEFAULT false,
    "publishedPropertyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TiparPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactUnlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tiparPostId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "buyerUserId" TEXT NOT NULL,
    "tiparUserId" TEXT NOT NULL,
    "tiparPostId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CONTACT_UNLOCK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TiparPost_publishedPropertyId_key" ON "TiparPost"("publishedPropertyId");
CREATE INDEX "TiparPost_userId_createdAt_idx" ON "TiparPost"("userId", "createdAt");
CREATE INDEX "TiparPost_isShorts_isActive_approved_idx" ON "TiparPost"("isShorts", "isActive", "approved");
CREATE INDEX "TiparPost_deletedAt_idx" ON "TiparPost"("deletedAt");

CREATE UNIQUE INDEX "ContactUnlock_userId_tiparPostId_key" ON "ContactUnlock"("userId", "tiparPostId");
CREATE INDEX "ContactUnlock_tiparPostId_idx" ON "ContactUnlock"("tiparPostId");

CREATE INDEX "CreditTransaction_buyerUserId_createdAt_idx" ON "CreditTransaction"("buyerUserId", "createdAt");
CREATE INDEX "CreditTransaction_tiparUserId_createdAt_idx" ON "CreditTransaction"("tiparUserId", "createdAt");
CREATE INDEX "CreditTransaction_tiparPostId_idx" ON "CreditTransaction"("tiparPostId");

CREATE INDEX "Property_isTiparTip_listingType_idx" ON "Property"("isTiparTip", "listingType");

-- AddForeignKey
ALTER TABLE "TiparPost" ADD CONSTRAINT "TiparPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TiparPost" ADD CONSTRAINT "TiparPost_publishedPropertyId_fkey" FOREIGN KEY ("publishedPropertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContactUnlock" ADD CONSTRAINT "ContactUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactUnlock" ADD CONSTRAINT "ContactUnlock_tiparPostId_fkey" FOREIGN KEY ("tiparPostId") REFERENCES "TiparPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_tiparUserId_fkey" FOREIGN KEY ("tiparUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_tiparPostId_fkey" FOREIGN KEY ("tiparPostId") REFERENCES "TiparPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
