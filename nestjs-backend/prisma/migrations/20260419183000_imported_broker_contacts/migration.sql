-- Imported broker contacts (from listing imports)

CREATE TABLE "ImportedBrokerContact" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL DEFAULT '',
    "companyName" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "sourcePortal" TEXT,
    "sourceUrl" TEXT,
    "city" TEXT,
    "notes" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listingCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "profileCreated" BOOLEAN NOT NULL DEFAULT false,
    "invitedAt" TIMESTAMP(3),
    "outreachStatus" TEXT NOT NULL DEFAULT 'none',
    "outreachNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportedBrokerContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportedBrokerContactListing" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportedBrokerContactListing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImportedBrokerContactListing_contactId_propertyId_key" ON "ImportedBrokerContactListing"("contactId", "propertyId");

CREATE INDEX "ImportedBrokerContact_email_idx" ON "ImportedBrokerContact"("email");
CREATE INDEX "ImportedBrokerContact_phone_idx" ON "ImportedBrokerContact"("phone");
CREATE INDEX "ImportedBrokerContact_sourcePortal_idx" ON "ImportedBrokerContact"("sourcePortal");
CREATE INDEX "ImportedBrokerContact_lastSeenAt_idx" ON "ImportedBrokerContact"("lastSeenAt" DESC);
CREATE INDEX "ImportedBrokerContact_listingCount_idx" ON "ImportedBrokerContact"("listingCount" DESC);
CREATE INDEX "ImportedBrokerContact_outreachStatus_idx" ON "ImportedBrokerContact"("outreachStatus");
CREATE INDEX "ImportedBrokerContact_profileCreated_idx" ON "ImportedBrokerContact"("profileCreated");

CREATE INDEX "ImportedBrokerContactListing_propertyId_idx" ON "ImportedBrokerContactListing"("propertyId");

ALTER TABLE "ImportedBrokerContactListing" ADD CONSTRAINT "ImportedBrokerContactListing_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ImportedBrokerContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportedBrokerContactListing" ADD CONSTRAINT "ImportedBrokerContactListing_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
