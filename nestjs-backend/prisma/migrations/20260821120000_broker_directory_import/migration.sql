-- Broker directory import (RealitníEso adresář RK)

ALTER TABLE "ImportedBrokerContact" ADD COLUMN "normalizedPhone" TEXT;
ALTER TABLE "ImportedBrokerContact" ADD COLUMN "address" TEXT;
ALTER TABLE "ImportedBrokerContact" ADD COLUMN "importedAt" TIMESTAMP(3);
ALTER TABLE "ImportedBrokerContact" ADD COLUMN "lastCheckedAt" TIMESTAMP(3);
ALTER TABLE "ImportedBrokerContact" ADD COLUMN "contactStatus" TEXT NOT NULL DEFAULT 'NEW';

CREATE INDEX "ImportedBrokerContact_normalizedPhone_idx" ON "ImportedBrokerContact"("normalizedPhone");
CREATE INDEX "ImportedBrokerContact_sourceUrl_idx" ON "ImportedBrokerContact"("sourceUrl");
CREATE INDEX "ImportedBrokerContact_contactStatus_idx" ON "ImportedBrokerContact"("contactStatus");
