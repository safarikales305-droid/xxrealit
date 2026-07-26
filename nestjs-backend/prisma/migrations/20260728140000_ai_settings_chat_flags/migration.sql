-- AI chat feature flags on global AiSettings
ALTER TABLE "AiSettings" ADD COLUMN IF NOT EXISTS "chatEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiSettings" ADD COLUMN IF NOT EXISTS "publicChatEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiSettings" ADD COLUMN IF NOT EXISTS "testModeEnabled" BOOLEAN NOT NULL DEFAULT true;
