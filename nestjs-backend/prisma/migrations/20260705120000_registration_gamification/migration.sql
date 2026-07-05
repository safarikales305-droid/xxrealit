-- Gamifikace registrace návštěvníků

CREATE TABLE "RegistrationGamificationSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "gameType" TEXT NOT NULL DEFAULT 'real_estate_magnate',
    "audience" TEXT NOT NULL DEFAULT 'UNAUTHENTICATED',
    "showOnHome" BOOLEAN NOT NULL DEFAULT true,
    "showOnShorts" BOOLEAN NOT NULL DEFAULT true,
    "showOnClassic" BOOLEAN NOT NULL DEFAULT true,
    "showOnPosts" BOOLEAN NOT NULL DEFAULT false,
    "showOnProfessionalProfile" BOOLEAN NOT NULL DEFAULT false,
    "triggerType" TEXT NOT NULL DEFAULT 'SHORTS_VIEWS',
    "triggerShortsViews" INTEGER NOT NULL DEFAULT 3,
    "triggerSecondsOnSite" INTEGER NOT NULL DEFAULT 45,
    "triggerPagesVisited" INTEGER NOT NULL DEFAULT 2,
    "frequency" TEXT NOT NULL DEFAULT 'ONCE',
    "decisionsCount" INTEGER NOT NULL DEFAULT 8,
    "offerIntervalSec" INTEGER NOT NULL DEFAULT 3,
    "bonusCredits" INTEGER NOT NULL DEFAULT 500,
    "bonusDescription" TEXT NOT NULL DEFAULT 'Bonusové kredity po registraci',
    "autoEmailMarketing" BOOLEAN NOT NULL DEFAULT true,
    "autoWhatsAppCampaign" BOOLEAN NOT NULL DEFAULT true,
    "autoCrm" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrationGamificationSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RegistrationGamificationLead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "fullName" TEXT,
    "companyName" TEXT,
    "visitorType" TEXT NOT NULL DEFAULT 'MIXED',
    "score" INTEGER NOT NULL DEFAULT 0,
    "gameDurationSec" INTEGER,
    "decisions" JSONB,
    "gameResult" JSONB,
    "ipAddress" TEXT,
    "country" TEXT,
    "city" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "referer" TEXT,
    "landingPage" TEXT,
    "visitSource" TEXT,
    "gameSessionId" TEXT,
    "userId" TEXT,
    "registeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrationGamificationLead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RegistrationGamificationEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "visitorKey" TEXT,
    "sessionId" TEXT,
    "pagePath" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrationGamificationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RegistrationGamificationLead_email_idx" ON "RegistrationGamificationLead"("email");
CREATE INDEX "RegistrationGamificationLead_visitorType_idx" ON "RegistrationGamificationLead"("visitorType");
CREATE INDEX "RegistrationGamificationLead_createdAt_idx" ON "RegistrationGamificationLead"("createdAt" DESC);
CREATE INDEX "RegistrationGamificationLead_userId_idx" ON "RegistrationGamificationLead"("userId");
CREATE INDEX "RegistrationGamificationLead_gameSessionId_idx" ON "RegistrationGamificationLead"("gameSessionId");

CREATE INDEX "RegistrationGamificationEvent_eventType_createdAt_idx" ON "RegistrationGamificationEvent"("eventType", "createdAt" DESC);
CREATE INDEX "RegistrationGamificationEvent_visitorKey_idx" ON "RegistrationGamificationEvent"("visitorKey");
CREATE INDEX "RegistrationGamificationEvent_sessionId_idx" ON "RegistrationGamificationEvent"("sessionId");

ALTER TABLE "RegistrationGamificationLead" ADD CONSTRAINT "RegistrationGamificationLead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "RegistrationGamificationSetting" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);
