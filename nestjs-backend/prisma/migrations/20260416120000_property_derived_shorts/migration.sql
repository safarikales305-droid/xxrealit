-- Vazba SHORTS inzerátu na zdrojový klasický inzerát

ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "derivedFromPropertyId" TEXT;

CREATE INDEX IF NOT EXISTS "Property_derivedFromPropertyId_idx" ON "Property"("derivedFromPropertyId");

ALTER TABLE "Property" DROP CONSTRAINT IF EXISTS "Property_derivedFromPropertyId_fkey";

ALTER TABLE "Property" ADD CONSTRAINT "Property_derivedFromPropertyId_fkey" FOREIGN KEY ("derivedFromPropertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
