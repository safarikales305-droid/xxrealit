-- Marketing popups, PWA push campaigns, onboarding email flag
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileOnboardingEmailSentAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "MarketingPopup" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "imageUrl" TEXT,
  "videoUrl" TEXT,
  "buttons" JSONB NOT NULL DEFAULT '[]',
  "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "triggers" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingPopup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MarketingPopup_isEnabled_sortOrder_idx" ON "MarketingPopup"("isEnabled", "sortOrder");

CREATE TABLE IF NOT EXISTS "PwaPushCampaign" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "url" TEXT,
  "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "targetCity" TEXT,
  "targetInterests" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "scheduledAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PwaPushCampaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PwaPushCampaign_status_scheduledAt_idx" ON "PwaPushCampaign"("status", "scheduledAt");
