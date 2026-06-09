-- Contact monetization settings and extended lead/transaction fields

CREATE TABLE "ContactMonetizationSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "tipPortalPercent" INTEGER NOT NULL DEFAULT 30,
    "tipTipsterPercent" INTEGER NOT NULL DEFAULT 70,
    "ownerListingContactPrice" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMonetizationSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ContactMonetizationSetting" ("id", "tipPortalPercent", "tipTipsterPercent", "ownerListingContactPrice", "updatedAt")
VALUES ('default', 30, 70, 50, CURRENT_TIMESTAMP);

ALTER TABLE "ContactLead" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'LISTING';
ALTER TABLE "ContactLead" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "ContactLead" ADD COLUMN "tipsterUserId" TEXT;
ALTER TABLE "ContactLead" ADD COLUMN "portalAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ContactLead" ADD COLUMN "tipsterAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ContactLead" ADD COLUMN "ownerChargedAmount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "ContactLead_sourceType_sourceId_idx" ON "ContactLead"("sourceType", "sourceId");
CREATE INDEX "ContactLead_tipsterUserId_createdAt_idx" ON "ContactLead"("tipsterUserId", "createdAt");

ALTER TABLE "ContactLead" ADD CONSTRAINT "ContactLead_tipsterUserId_fkey" FOREIGN KEY ("tipsterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditTransaction" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "CreditTransaction" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "CreditTransaction" ADD COLUMN "counterpartyUserId" TEXT;
ALTER TABLE "CreditTransaction" ADD COLUMN "portalAmount" INTEGER;
ALTER TABLE "CreditTransaction" ADD COLUMN "tipsterAmount" INTEGER;
ALTER TABLE "CreditTransaction" ADD COLUMN "description" TEXT;

CREATE INDEX "CreditTransaction_sourceType_sourceId_idx" ON "CreditTransaction"("sourceType", "sourceId");
