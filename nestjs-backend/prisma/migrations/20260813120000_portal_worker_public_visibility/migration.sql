-- Veřejná viditelnost pracovníků portálu: publikování příspěvků a katalog profesionálů.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canPublishPosts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showInProfessionals" BOOLEAN NOT NULL DEFAULT false;

-- Stávající veřejné profily mohou publikovat příspěvky.
UPDATE "User"
SET "canPublishPosts" = true
WHERE COALESCE("publicProfile", false) = true;

-- Stávající profesionálové v katalogu.
UPDATE "User"
SET "showInProfessionals" = true
WHERE COALESCE("publicProfessionalProfile", false) = true
   OR COALESCE("isPublicBrokerProfile", false) = true;

-- Schválení pracovníci portálu s veřejným profilem.
UPDATE "User"
SET "showInProfessionals" = true,
    "canPublishPosts" = true
WHERE role = 'PORTAL_WORKER'
  AND COALESCE("publicProfile", false) = true
  AND "portalWorkerStatus" = 'APPROVED';
