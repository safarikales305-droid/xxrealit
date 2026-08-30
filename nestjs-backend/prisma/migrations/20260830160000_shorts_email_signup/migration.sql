-- Shorts email signup settings + analytics events
ALTER TABLE "RegistrationGateSetting" ADD COLUMN IF NOT EXISTS "emailSignupEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RegistrationGateSetting" ADD COLUMN IF NOT EXISTS "emailSignupAfterViews" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "RegistrationGateSetting" ADD COLUMN IF NOT EXISTS "emailSignupTitle" TEXT NOT NULL DEFAULT 'Připojte se k XXREALIT';
ALTER TABLE "RegistrationGateSetting" ADD COLUMN IF NOT EXISTS "emailSignupDescription" TEXT NOT NULL DEFAULT 'Sledujte reality, videa a novinky na jednom místě.';
ALTER TABLE "RegistrationGateSetting" ADD COLUMN IF NOT EXISTS "emailSignupButtonText" TEXT NOT NULL DEFAULT 'Pokračovat';
ALTER TABLE "RegistrationGateSetting" ADD COLUMN IF NOT EXISTS "emailSignupDismissText" TEXT NOT NULL DEFAULT 'Nechci registraci';
ALTER TABLE "RegistrationGateSetting" ADD COLUMN IF NOT EXISTS "emailSignupDismissCooldownDays" INTEGER NOT NULL DEFAULT 7;

CREATE TABLE IF NOT EXISTS "ShortsSignupEvent" (
  "id" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "anonymousSessionId" TEXT,
  "userId" TEXT,
  "triggerViewCount" INTEGER,
  "shortType" TEXT,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "referrer" TEXT,
  "variantId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShortsSignupEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShortsSignupEvent_eventName_createdAt_idx" ON "ShortsSignupEvent"("eventName", "createdAt");
CREATE INDEX IF NOT EXISTS "ShortsSignupEvent_anonymousSessionId_createdAt_idx" ON "ShortsSignupEvent"("anonymousSessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "ShortsSignupEvent_userId_idx" ON "ShortsSignupEvent"("userId");
