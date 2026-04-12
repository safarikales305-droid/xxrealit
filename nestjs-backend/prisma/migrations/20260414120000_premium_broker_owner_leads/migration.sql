-- Premium makléř, vlastnické inzeráty, notifikace, body, leady

ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "isOwnerListing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "ownerContactConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "region" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "district" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "Property_isOwnerListing_createdAt_idx" ON "Property" ("isOwnerListing", "createdAt");

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPremiumBroker" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brokerLeadNotificationEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brokerPreferredRegions" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brokerPreferredPropertyTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brokerPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brokerFreeLeads" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "UserNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserNotification_userId_readAt_idx" ON "UserNotification" ("userId", "readAt");
CREATE INDEX IF NOT EXISTS "UserNotification_userId_createdAt_idx" ON "UserNotification" ("userId", "createdAt");

ALTER TABLE "UserNotification" DROP CONSTRAINT IF EXISTS "UserNotification_userId_fkey";
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "BrokerPointsLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerPointsLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BrokerPointsLedger_userId_dedupeKey_key" ON "BrokerPointsLedger" ("userId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "BrokerPointsLedger_userId_createdAt_idx" ON "BrokerPointsLedger" ("userId", "createdAt");

ALTER TABLE "BrokerPointsLedger" DROP CONSTRAINT IF EXISTS "BrokerPointsLedger_userId_fkey";
ALTER TABLE "BrokerPointsLedger" ADD CONSTRAINT "BrokerPointsLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "BrokerLeadOffer" (
    "id" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "usedFreeLead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerLeadOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BrokerLeadOffer_brokerId_propertyId_key" ON "BrokerLeadOffer" ("brokerId", "propertyId");
CREATE INDEX IF NOT EXISTS "BrokerLeadOffer_propertyId_idx" ON "BrokerLeadOffer" ("propertyId");
CREATE INDEX IF NOT EXISTS "BrokerLeadOffer_brokerId_idx" ON "BrokerLeadOffer" ("brokerId");

ALTER TABLE "BrokerLeadOffer" DROP CONSTRAINT IF EXISTS "BrokerLeadOffer_brokerId_fkey";
ALTER TABLE "BrokerLeadOffer" DROP CONSTRAINT IF EXISTS "BrokerLeadOffer_propertyId_fkey";
ALTER TABLE "BrokerLeadOffer" ADD CONSTRAINT "BrokerLeadOffer_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrokerLeadOffer" ADD CONSTRAINT "BrokerLeadOffer_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
