-- Ensure ADMIN role exists in legacy databases.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'UserRole'
      AND e.enumlabel = 'ADMIN'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'ADMIN';
  END IF;
END $$;

-- Ensure User.role default is USER.
ALTER TABLE "public"."User"
  ALTER COLUMN "role" SET DEFAULT 'USER'::"UserRole";
