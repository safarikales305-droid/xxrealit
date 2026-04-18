-- Imported listings may have unknown price ("Cena na dotaz") instead of bogus 1 Kč.
ALTER TABLE "Property" ALTER COLUMN "price" DROP NOT NULL;
