-- Stav leadů z gamifikační hry
ALTER TABLE "RegistrationGamificationLead"
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'NEW';

CREATE INDEX IF NOT EXISTS "RegistrationGamificationLead_status_idx"
ON "RegistrationGamificationLead"("status");

-- Meta katalog inzerátů pro Facebook reklamy
CREATE TABLE IF NOT EXISTS "MetaCatalogSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastItemCount" INTEGER NOT NULL DEFAULT 0,
    "lastGeneratedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "carouselListingIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaCatalogSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "MetaCatalogSetting" ("id", "updatedAt")
VALUES ('default', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
