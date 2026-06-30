-- Jednotné pole veřejného profilu pro publikování příspěvků a feed.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPublicProfile" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User" u
SET "isPublicProfile" = true
WHERE
  COALESCE(u."isPublicBrokerProfile", false) = true
  OR COALESCE(u."publicProfessionalProfile", false) = true
  OR EXISTS (SELECT 1 FROM "AgentProfile" ap WHERE ap."userId" = u.id AND ap."isPublic" = true)
  OR EXISTS (SELECT 1 FROM "CompanyProfile" cp WHERE cp."userId" = u.id AND cp."isPublic" = true)
  OR EXISTS (SELECT 1 FROM "AgencyProfile" ag WHERE ag."userId" = u.id AND ag."isPublic" = true)
  OR EXISTS (SELECT 1 FROM "FinancialAdvisorProfile" fa WHERE fa."userId" = u.id AND fa."isPublic" = true)
  OR EXISTS (SELECT 1 FROM "InvestorProfile" ip WHERE ip."userId" = u.id AND ip."isPublic" = true);
