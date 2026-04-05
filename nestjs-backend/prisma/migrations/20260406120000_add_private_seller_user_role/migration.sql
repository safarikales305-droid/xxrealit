-- PRIVATE_SELLER: sdílená DB s Next / veřejná registrace (bez pádu při duplicitě)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'UserRole'
      AND e.enumlabel = 'PRIVATE_SELLER'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'PRIVATE_SELLER';
  END IF;
END $$;
