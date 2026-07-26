-- Admin test mode flag for AI chat diagnostics
ALTER TABLE "AiChatSettings" ADD COLUMN IF NOT EXISTS "adminTestEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiChatSettings" ADD COLUMN IF NOT EXISTS "lastAdminTestAt" TIMESTAMP(3);
ALTER TABLE "AiChatSettings" ADD COLUMN IF NOT EXISTS "lastAdminTestSuccess" BOOLEAN;
ALTER TABLE "AiChatSettings" ADD COLUMN IF NOT EXISTS "lastAdminTestErrorCode" TEXT;
ALTER TABLE "AiChatSettings" ADD COLUMN IF NOT EXISTS "lastAdminTestError" TEXT;
