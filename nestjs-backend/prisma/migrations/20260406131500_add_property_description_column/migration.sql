-- Ensure Property.description exists on legacy databases.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Property'
      AND column_name = 'description'
  ) THEN
    ALTER TABLE "public"."Property"
      ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
    ALTER TABLE "public"."Property"
      ALTER COLUMN "description" DROP DEFAULT;
  END IF;
END $$;
