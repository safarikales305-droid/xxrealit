-- Add Property.status for admin moderation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Property'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE "public"."Property"
      ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING';
  END IF;
END $$;

-- Backfill status from approved for legacy rows (only when approved column exists).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Property'
      AND column_name = 'approved'
  ) THEN
    UPDATE "public"."Property"
    SET "status" = CASE WHEN "approved" = TRUE THEN 'APPROVED' ELSE 'PENDING' END
    WHERE "status" IS NULL OR "status" = '';
  END IF;
END $$;

-- Track visits for admin dashboard.
CREATE TABLE IF NOT EXISTS "public"."Visit" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);
