-- Advertiser lead unlock: optional tip fields on CreditTransaction, seller contact admin flag
ALTER TABLE "CreditTransaction" ALTER COLUMN "tiparUserId" DROP NOT NULL;
ALTER TABLE "CreditTransaction" ALTER COLUMN "tiparPostId" DROP NOT NULL;

ALTER TABLE "CreditTransaction" ADD COLUMN "propertyId" TEXT;

CREATE INDEX "CreditTransaction_propertyId_idx" ON "CreditTransaction"("propertyId");

ALTER TABLE "CreditTransaction"
  ADD CONSTRAINT "CreditTransaction_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContactMonetizationSetting"
  ADD COLUMN "showSellerContactToBuyer" BOOLEAN NOT NULL DEFAULT false;
