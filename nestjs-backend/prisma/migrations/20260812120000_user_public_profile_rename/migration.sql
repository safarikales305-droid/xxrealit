-- Přejmenování isPublicProfile → publicProfile (kanonické pole).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'isPublicProfile'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'publicProfile'
  ) THEN
    ALTER TABLE "User" RENAME COLUMN "isPublicProfile" TO "publicProfile";
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'publicProfile'
  ) THEN
    ALTER TABLE "User" ADD COLUMN "publicProfile" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

UPDATE "User" u
SET "publicProfile" = true
WHERE COALESCE(u."publicProfile", false) = false
  AND (
    COALESCE(u."isPublicBrokerProfile", false) = true
    OR COALESCE(u."publicProfessionalProfile", false) = true
    OR EXISTS (SELECT 1 FROM "AgentProfile" ap WHERE ap."userId" = u.id AND ap."isPublic" = true)
    OR EXISTS (SELECT 1 FROM "CompanyProfile" cp WHERE cp."userId" = u.id AND cp."isPublic" = true)
    OR EXISTS (SELECT 1 FROM "AgencyProfile" ag WHERE ag."userId" = u.id AND ag."isPublic" = true)
    OR EXISTS (SELECT 1 FROM "FinancialAdvisorProfile" fa WHERE fa."userId" = u.id AND fa."isPublic" = true)
    OR EXISTS (SELECT 1 FROM "InvestorProfile" ip WHERE ip."userId" = u.id AND ip."isPublic" = true)
  );
