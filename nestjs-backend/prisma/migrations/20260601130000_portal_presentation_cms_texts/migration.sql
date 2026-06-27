-- Editovatelné texty hero a FAQ na /o-portalu
ALTER TABLE "PortalPresentationPage" ADD COLUMN IF NOT EXISTS "heroBadgeText" TEXT DEFAULT 'Představení portálu';
ALTER TABLE "PortalPresentationPage" ADD COLUMN IF NOT EXISTS "faqTitle" TEXT DEFAULT 'Časté dotazy';

UPDATE "PortalPresentationPage"
SET "heroBadgeText" = 'Představení portálu'
WHERE "heroBadgeText" IS NULL;

UPDATE "PortalPresentationPage"
SET "faqTitle" = 'Časté dotazy'
WHERE "faqTitle" IS NULL;
