-- Split credit balances and anti-abuse settings

ALTER TABLE "User" ADD COLUMN "realCreditBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "bonusCreditBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "pendingCreditBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "isCreditVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "firstTopUpUsed" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User" SET "realCreditBalance" = GREATEST(0, "creditBalance");

ALTER TABLE "CreditLedger" ADD COLUMN "creditType" TEXT;
ALTER TABLE "CreditLedger" ADD COLUMN "purpose" TEXT;

ALTER TABLE "CreditTopUpSetting" ADD COLUMN "allowUnverifiedFirstTopUp" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CreditTopUpSetting" ADD COLUMN "maxUnverifiedFirstTopUpAmount" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "CreditTopUpSetting" ADD COLUMN "allowPendingCreditSpending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CreditTopUpSetting" ADD COLUMN "allowPendingForInternalServices" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CreditTopUpSetting" ADD COLUMN "allowBonusCreditOnListingContacts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CreditTopUpSetting" ADD COLUMN "allowBonusCreditOnTipContacts" BOOLEAN NOT NULL DEFAULT false;
