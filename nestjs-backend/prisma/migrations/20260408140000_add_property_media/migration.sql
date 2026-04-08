CREATE TABLE IF NOT EXISTS "PropertyMedia" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropertyMedia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PropertyMedia_propertyId_idx" ON "PropertyMedia"("propertyId");
CREATE INDEX IF NOT EXISTS "PropertyMedia_sortOrder_idx" ON "PropertyMedia"("sortOrder");

DO $$ BEGIN
  ALTER TABLE "PropertyMedia"
  ADD CONSTRAINT "PropertyMedia_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
