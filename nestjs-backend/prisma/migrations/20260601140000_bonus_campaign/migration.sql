-- CreateEnum
CREATE TYPE "BonusAppliesTo" AS ENUM ('LISTING', 'TIP', 'BOTH');

-- CreateEnum
CREATE TYPE "BonusSourceType" AS ENUM ('LISTING', 'TIP');

-- CreateTable
CREATE TABLE "BonusCampaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ctaText" TEXT NOT NULL DEFAULT 'Založ účet, inzeruj a vydělávej',
    "bonusText" TEXT NOT NULL DEFAULT 'Bonus 1 000 Kč kreditu při vložení inzerátu nebo tipu',
    "amount" INTEGER NOT NULL,
    "appliesTo" "BonusAppliesTo" NOT NULL DEFAULT 'BOTH',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "activeFrom" TIMESTAMP(3),
    "activeTo" TIMESTAMP(3),
    "oncePerUser" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BonusCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonusClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "sourceType" "BonusSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonusClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "referenceId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BonusCampaign_isActive_activeFrom_activeTo_idx" ON "BonusCampaign"("isActive", "activeFrom", "activeTo");

-- CreateIndex
CREATE INDEX "BonusClaim_userId_createdAt_idx" ON "BonusClaim"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BonusClaim_campaignId_idx" ON "BonusClaim"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "BonusClaim_userId_campaignId_key" ON "BonusClaim"("userId", "campaignId");

-- CreateIndex
CREATE INDEX "CreditLedger_userId_createdAt_idx" ON "CreditLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedger_type_idx" ON "CreditLedger"("type");

-- AddForeignKey
ALTER TABLE "BonusClaim" ADD CONSTRAINT "BonusClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusClaim" ADD CONSTRAINT "BonusClaim_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BonusCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
