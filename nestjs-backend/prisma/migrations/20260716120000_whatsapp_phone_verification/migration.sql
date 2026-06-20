-- WhatsApp phone verification fields on User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappVerificationCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappVerificationExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappVerificationAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappVerificationSentAt" TIMESTAMP(3);
