-- AlterTable
ALTER TABLE "User" ADD COLUMN "termsAccepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "termsVersion" INTEGER;
ALTER TABLE "User" ADD COLUMN "termsIp" TEXT;
ALTER TABLE "User" ADD COLUMN "termsUserAgent" VARCHAR(512);

-- CreateTable
CREATE TABLE "PortalTermsVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "termsHtml" TEXT NOT NULL,
    "rulesHtml" TEXT NOT NULL,
    "operatorContact" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "requireReacceptOnLogin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "PortalTermsVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalTermsVersion_version_key" ON "PortalTermsVersion"("version");

-- CreateIndex
CREATE INDEX "PortalTermsVersion_isPublished_publishedAt_idx" ON "PortalTermsVersion"("isPublished", "publishedAt");

-- AddForeignKey
ALTER TABLE "PortalTermsVersion" ADD CONSTRAINT "PortalTermsVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default published version
INSERT INTO "PortalTermsVersion" (
    "id",
    "version",
    "title",
    "termsHtml",
    "rulesHtml",
    "operatorContact",
    "isPublished",
    "requireReacceptOnLogin",
    "createdAt",
    "updatedAt",
    "publishedAt"
) VALUES (
    'portal_terms_v1',
    1,
    'Obchodní podmínky portálu XXrealit.cz',
    '<h2>Obchodní podmínky</h2><p>Vítejte na portálu XXrealit.cz. Používáním portálu souhlasíte s těmito obchodními podmínkami.</p><p><strong>Provozovatel</strong> poskytuje online platformu pro prezentaci nemovitostí, komunikaci mezi uživateli a související služby.</p><ul><li>Uživatel je povinen uvádět pravdivé údaje.</li><li>Obsah nesmí porušovat právní předpisy ani práva třetích osob.</li><li>Provozovatel může obsah moderovat a účet omezit při porušení pravidel.</li></ul>',
    '<h2>Pravidla portálu</h2><p>Na portálu je zakázáno zveřejňovat klamavé inzeráty, spam a nelegální obsah. Respektujte ostatní uživatele a dodržujte pokyny administrace.</p>',
    'Provozovatel: XXrealit.cz\nE-mail: info@xxrealit.cz\nWeb: https://www.xxrealit.cz',
    true,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
